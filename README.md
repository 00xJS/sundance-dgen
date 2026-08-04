# Sundance deGen

A browser tool that writes Pokémon GO meetup descriptions for [Niantic's Campfire](https://niantic.helpshift.com/hc/en/19-campfire/), so organisers stop retyping the same post every month.

Paste a month's event schedule as a markdown table and get a finished, copy-ready description for every event — with the Pokémon artwork, 100% IV catch CP, and shiny availability filled in automatically. Or build one event at a time by hand.

Vanilla HTML/CSS/JS. No build step, no dependencies, no framework — just static files.

---

## Two ways to use it

### Bulk Import (the fast path)

Paste a markdown table of events and hit **Generate All Descriptions**. Each row becomes a finished description.

The table needs three columns — event name, details, date — and a header row:

```markdown
| Event Name | Details | Date |
| --- | --- | --- |
| Ho-Oh Raid Hour | Boosted shiny raids | August 12 |
| Charmander Community Day | 3x Catch Stardust, +1 special trade and half trade cost | August 16 |
```

From each row the tool works out:

| Field | How |
| --- | --- |
| Event type | Matched against the known types in the event name |
| Pokémon | The part of the name that isn't the event type. Hyphenated names like `Ho-Oh` and `Porygon-Z` are handled, and several can be listed — see below |
| Date | Month + day. **A written year is used as-is.** Without one, the current year is assumed, rolling forward if that month has already been and gone |
| Bonuses | Keyword-matched from the details column, capped at the event type's limit |
| Shiny | Looked up against the released-shiny list, falling back to whether "shiny" appears in the details |
| Catch CP | Curated table first, then computed from base stats |
| Featured attack | Pulled from "gets"/"learns" phrasing in the details |

Rows it can't read are reported inline as a **Skipped** notice and don't stop the rest of the batch.

**Put the Pokémon in the Event Name**, not the Details column — `Groudon Raid Hour`, not `Raid Hour` with "Groudon" in Details.

**Several featured Pokémon** can be listed with commas, `&`, `and` or `or`. Each gets its own labelled CP line, and their artwork stacks into one square tile (three arrange as a pyramid):

```
| Articuno, Zapdos & Moltres Raid Hour | five-star raids | September 2 |
```

```
Articuno, Zapdos & Moltres Raid Hour
🎈 Join us at Sundance Park on September 2nd for the Articuno, Zapdos & Moltres Raid Hour from 6-7PM 💃☀️🕺

💯 Articuno - 1743 / WB - 2179
💯 Zapdos - 2015 / WB - 2519
💯 Moltres - 1980 / WB - 2475
```

**Events with nothing announced yet** work too — a bare `Raid Hour` renders as just "Raid Hour" with no CP line, rather than inventing a name or leaving an empty one.

### Manual builder

Click an event type, choose how many descriptions you need (up to 20), and fill in the fields. The Pokémon field autocompletes — arrow keys and <kbd>Enter</kbd> work, as does the mouse — and choosing a name fills in CP and shiny status.

Your pasted event list and location settings survive a refresh.

---

## Event types

| Event type | Time | Max bonuses | Extra fields |
| --- | --- | --- | --- |
| Spotlight Hour | 6-7PM | 2 | — |
| Raid Hour | 6-7PM | — | 100% CP, weather-boosted CP |
| Community Day | 2-5PM | 4 | Featured attack |
| Community Day Classic | 2-5PM | 4 | Featured attack |
| Raid Day | 2-5PM | 4 | 100% CP, weather-boosted CP, featured attack |
| Hatch Day | 2-5PM | 3 | — |
| Research Day | 2-5PM | 2 | — |
| Max Battles | 2-5PM | 5 | 100% CP |

Location defaults to **Sundance Park**; switch to **Custom** for anywhere else.

## Output

```
Ho-Oh Raid Hour
🎈 Join us at Sundance Park on August 12th for the Ho-Oh Raid Hour from 6-7PM 💃☀️🕺

💯 - 2207 / WB - 2759

If you're lucky, you might encounter a shiny one ✨
✅ "Check in" on Campfire when you arrive
```

Each result comes with the Pokémon's artwork and a **Copy** button.

---

## Running locally

The scripts are ES modules, so opening `index.html` off disk won't work — it needs to be served over HTTP:

```bash
python3 -m http.server 8080
```

Then open <http://localhost:8080>. Any static server works.

## Tests

Pure logic — table parsing, name extraction, bonus matching, date handling, description rendering — is separated from the DOM in `parse.js` and covered by Node's built-in test runner. No dependencies to install:

```bash
npm test
```

## Project layout

| File | What's in it |
| --- | --- |
| `index.html` | Markup and the full stylesheet (Observation Deck design tokens, dark-only) |
| `config.js` | Event definitions, bonus keyword patterns, and every fixed phrase in the output |
| `parse.js` | Pure logic — parsing, formatting, and the single description renderer |
| `data.js` | Everything that touches the network, plus the data-source status chip |
| `main.js` | DOM wiring only |
| `cpOverrides.js` | Manual CP pins for cases base stats can't express — normally empty |
| `data/` | Vendored API snapshots, refreshed weekly by CI |
| `scripts/refresh-data.js` | Fetches and trims those snapshots |
| `test/` | Test suite |

## Adapting it for another community

`config.js` is the only file you need. `constants` holds every fixed phrase in the generated text; `eventConfig` defines which event types exist, when they run, which bonuses each may carry, and which extra fields it collects. A type's `specialFields` drives both the form and the description — adding `"hundo"` makes the CP line appear, `"attack"` adds the featured-attack line — so no other file hardcodes wording or event names.

## Data sources

| Source | Used for |
| --- | --- |
| [PokéAPI](https://pokeapi.co) | Autocomplete name list; Pokédex number for artwork |
| [pokemon.com](https://www.pokemon.com) | Official artwork |
| [PoGoAPI](https://pogoapi.net) | Base stats for CP calculation; released-shiny list |

Catch CP is `(attack + 15) × √(defense + 15) × √(stamina + 15) × CPM² ÷ 10`, using CPM 0.5974 (level 20, standard raid catch) and 0.667934 (level 25, weather boosted).

PoGoAPI data is **vendored into `data/`** rather than fetched at page load, so an outage there can't quietly strip the CP and shiny lines out of your descriptions. A weekly GitHub Action re-fetches it; the live API is consulted only for Pokémon released since the last snapshot. The status chip under the title shows which source is answering.

**CP is derived, never stored.** There is no table of CP values to maintain, so none can go stale. Lookups resolve cheapest-first: `cpOverrides.js` → snapshot → live API.

Two details make deriving reliable:

- **The catchable form is chosen explicitly.** PoGoAPI doesn't list base forms first — Galarian Articuno precedes Normal, Crowned Sword Zacian precedes Hero — so `CATCHABLE_FORMS` in `parse.js` picks the form you actually catch rather than whichever came first.
- **Form-qualified names are indexed under their own key.** "Deoxys Attack" and "Giratina (Origin)" have no entry of their own in the API, which models them as name + form. Both spellings of a regional form work: `Exeggutor (Alolan)` and `Exeggutor Alola` resolve to the same stats.

`cpOverrides.js` is the escape hatch for a value a human has to judge. It is currently empty — every name the tool has ever needed derives correctly. Prefer fixing the derivation over adding an override, since an override is a value nothing will re-check. `npm run refresh-data` reports overrides that have become redundant or unresolvable.

## Known limitations

- Bonus detection is keyword-based, so unusual phrasing in the details column may be missed. Check the generated bonus list before posting.
- Bulk results can't be edited in place — to change a parsed value, rebuild that event in the manual builder.
- Changing the "how many descriptions" count rebuilds the form and clears anything already typed in.
