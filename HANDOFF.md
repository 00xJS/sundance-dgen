# Sundance deGen — Development Handoff

Practical notes for picking this project up later. [README.md](README.md) covers what the tool *does*; this covers how it's built, why it's built that way, and the traps.

**Repo:** <https://github.com/00xJS/sundance-dgen> · **Live:** <https://sundance-dgen.netlify.app> · **Default branch:** `master` (not `main`)

---

## Architecture

Four modules with hard boundaries. Keeping them separate is what makes the logic testable — the whole test suite exists because `parse.js` touches nothing external.

| File | Owns | Must NOT |
| --- | --- | --- |
| `config.js` | Event definitions, bonus keyword patterns, every fixed phrase of output | — |
| `parse.js` | Pure logic: parsing, formatting, CP maths, the description renderer | Touch the DOM, the network, or `new Date()` without it being passed in |
| `data.js` | Everything crossing the network; data-source status | Touch the DOM |
| `main.js` | DOM wiring only | Contain parsing logic or description wording |
| `cpOverrides.js` | Manual CP pins for cases stats can't express | Grow without a documented reason |

If you find yourself writing a regex or a text template in `main.js`, it belongs in `parse.js` or `config.js`.

## Commands

```bash
python3 -m http.server 8080   # serve locally — ES modules need HTTP, file:// won't work
npm test                      # 57 tests, Node's built-in runner, zero dependencies
npm run refresh-data          # re-fetch data/ snapshots + audit overrides
```

## Non-negotiables

1. **One description renderer.** `renderDescription()` in `parse.js` is the only place description text is assembled. Both the manual builder and the bulk importer call it. They used to have separate copies and had already silently drifted apart — that's what the golden-output tests guard against.

2. **`specialFields` drives everything.** An event type's `specialFields` decides both which form inputs render *and* which lines appear in the description. `"hundo"` produces the CP line, `"attack"` the featured-attack line. Never branch on the event type's *name* to decide what to output.

3. **Never put an `await` before listener registration.** `main.js` wires up all its handlers synchronously and kicks off data loading in the background. A blocking `await fetchPokemonList()` once left the entire UI dead whenever PokéAPI was slow — every button inert, no error shown.

4. **Guard every optional form field.** Most event types render no CP inputs at all, and Max Battles renders `hundo` without `whundo`. Writing to a missing input throws and aborts the caller — which is how a CP bug silently disabled the shiny auto-fill on six of eight event types.

5. **Escape anything interpolated into HTML.** `escapeHTML()` in `main.js`. Event names come from pasted text; a stray `<` or `&` will otherwise mangle the output.

6. **Dark theme only.** No `prefers-color-scheme: light`, no theme toggle. See the fleet's `THEME-HANDOFF.md` (kept outside this repo).

## Data model: CP is derived, never stored

There is no table of CP values. Catch CP is computed from Pokémon GO base stats, so it can't go stale. This replaced a 161-entry hand-maintained table in which 21 values had drifted wrong.

Resolution order: `cpOverrides.js` → `data/` snapshot → live API.

Two subtleties make deriving work, and both cost real debugging time:

- **PoGoAPI does not list base forms first.** Galarian Articuno precedes Normal Articuno; Crowned Sword Zacian precedes Hero. Naive "first match wins" returns the wrong variant — Articuno computed 2051 instead of 1743. `CATCHABLE_FORMS` in `parse.js` picks the form you actually *catch*.
- **Form-qualified names have no entry of their own.** The API models "Deoxys Attack" as name `Deoxys` + form `Attack`. `indexBaseStats()` registers a combined key so they resolve, and both spellings of a regional form work (`Exeggutor (Alolan)` and `Exeggutor Alola`).

**The snapshot must keep every form.** `trimStats()` in `scripts/refresh-data.js` deliberately does not dedupe to one entry per name. Deduping silently breaks every form-qualified lookup — the CP line just comes out blank.

`cpOverrides.js` is currently empty and should stay that way if possible. Prefer fixing the derivation, because an override is a value nothing will ever re-check — exactly the staleness the table was deleted to remove.

## Data snapshots and CI

`data/*.json` is vendored, not fetched at page load. PoGoAPI is a volunteer project; an outage there would otherwise quietly strip CP and shiny lines out of posts, which is the worst failure mode because nothing looks broken.

- `.github/workflows/test.yml` — tests on push to `master` and on PRs.
- `.github/workflows/refresh-data.yml` — weekly (Mondays 06:17 UTC) plus `workflow_dispatch`. Re-fetches, runs tests, commits only if the data actually moved.

The refresh script preserves the previous `generated` timestamp when upstream data is unchanged, so a quiet week produces no commit. If you change that, you'll get 52 empty commits a year.

Its output also **audits `cpOverrides.js`** (flagging entries that have become redundant or unresolvable) and spot-checks that sample names — including form-qualified ones — still resolve. If upstream ever changes shape, that check is the early warning.

## Testing

Tests live in `test/parse.test.js` and cover `parse.js` only, by design.

- **Time is injected.** `formatDate(date, now)` and `parseEventRow(row, now)` take a `now` argument so tests pin it to a fixed date. Don't reintroduce a real-clock read.
- **Golden output tests** assert the exact description text. If you deliberately change wording in `config.js`, update the goldens in the same commit — that's the point of them.
- Every bug fixed so far has a regression test. Add one when you fix the next.

## Deployment

Netlify builds from `master` automatically; **merging publishes live.** PRs get a deploy preview, which is the best place to confirm `data/` is actually being served.

Deck screenshots are deliberately **deferred** until the whole Observation Deck fleet is ported — don't run `npm run screenshots` in the observation-deck repo for this site alone.

`.claude/` is gitignored: it holds a dev-server config with machine-specific absolute paths.

## Known limitations / backlog

Roughly in value order:

- **No "Copy All"** — ten events means ten Copy clicks.
- **Bulk results aren't editable** — to correct a parsed value you must rebuild that event in the manual builder.
- **Changing the description count rebuilds the form** and clears anything already typed.
- **Bonus detection is keyword-based** (`bonusPatterns` in `config.js`), so unusual phrasing is missed silently. Worth checking generated bonuses before posting.
- Autocomplete has ARIA and keyboard support, but the suggestion list still closes on a blur timeout.

## Adapting for another community

`config.js` is the only file to edit. `constants` holds every fixed phrase; `eventConfig` defines the event types, times, allowed bonuses and extra fields. Nothing else hardcodes wording or event names.
