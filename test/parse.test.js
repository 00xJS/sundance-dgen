import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
    normalizeName,
    getDaySuffix,
    formatDate,
    parseBulkTable,
    mapEventTypeFromName,
    extractPokemonFromEvent,
    parseDateString,
    extractBonusesFromDetails,
    extractAttackFromDetails,
    isShinyInDetails,
    lookupCPOverride,
    calcCatchCP,
    indexBaseStats,
    pokeApiSlug,
    renderDescription,
    parseEventRow
} from "../parse.js";

// A fixed "now" so nothing here depends on the day the suite runs.
const NOW = new Date("2026-08-01T12:00:00");

describe("extractPokemonFromEvent", () => {
    // Regression: a bare hyphen was treated as a separator, so "Ho-Oh Raid Hour"
    // parsed as "Oh Raid Hour" — wrong name, no artwork, no CP.
    test("keeps hyphenated Pokémon names intact", () => {
        assert.equal(extractPokemonFromEvent("Ho-Oh Raid Hour"), "Ho-Oh");
        assert.equal(extractPokemonFromEvent("Porygon-Z Spotlight Hour"), "Porygon-Z");
        assert.equal(extractPokemonFromEvent("Jangmo-o Community Day"), "Jangmo-o");
    });

    test("splits on en/em dashes and spaced hyphens", () => {
        assert.equal(extractPokemonFromEvent("Raid Day — Charizard"), "Charizard");
        assert.equal(extractPokemonFromEvent("Raid Day – Charizard"), "Charizard");
        assert.equal(extractPokemonFromEvent("Raid Day - Charizard"), "Charizard");
    });

    test("splits on the event type when there is no dash", () => {
        assert.equal(extractPokemonFromEvent("Charizard Raid Day"), "Charizard");
        assert.equal(extractPokemonFromEvent("Mr. Mime Spotlight Hour"), "Mr. Mime");
    });

    test("strips a Replay: prefix", () => {
        assert.equal(extractPokemonFromEvent("Replay: Charmander Community Day"), "Charmander");
    });

    test("returns empty string when nothing can be extracted", () => {
        assert.equal(extractPokemonFromEvent("Mystery Gathering"), "");
    });
});

describe("lookupCPOverride", () => {
    // CP is derived from base stats; overrides are the rare manual pin.
    test("returns null when nothing is pinned", () => {
        assert.equal(lookupCPOverride("Charizard"), null);
        assert.equal(lookupCPOverride("Not A Pokemon"), null);
    });

    test("tolerates an empty or missing name", () => {
        assert.equal(lookupCPOverride(""), null);
    });
});

describe("extractBonusesFromDetails", () => {
    // Regression: the pattern mapped only to "Extra Special Trade", which
    // Community Day does not declare, so the bonus was silently dropped.
    test("resolves the trade bonus to each event type's own spelling", () => {
        assert.deepEqual(
            extractBonusesFromDetails("Community Day", "+1 special trade and half trade cost"),
            ["+1 Special Trade & Half Trade Cost"]
        );
        assert.deepEqual(
            extractBonusesFromDetails("Community Day Classic", "extra special trade"),
            ["Extra Special Trade"]
        );
    });

    // Regression: /3[x×]\s*stardust/ did not allow "Catch" in between.
    test("matches 3x Catch Stardust as well as 3x Stardust", () => {
        assert.deepEqual(extractBonusesFromDetails("Community Day", "3x Catch Stardust"), ["3x Catch Stardust"]);
        assert.deepEqual(extractBonusesFromDetails("Community Day", "3x Stardust"), ["3x Catch Stardust"]);
    });

    test("finds several bonuses in one details cell", () => {
        assert.deepEqual(
            extractBonusesFromDetails("Community Day", "3x Catch Stardust, +1 special trade and half trade cost, 1/4 hatch distance"),
            ["3x Catch Stardust", "1/4 Hatch Distance", "+1 Special Trade & Half Trade Cost"]
        );
    });

    test("never exceeds the event type's maxBonuses", () => {
        const bonuses = extractBonusesFromDetails(
            "Spotlight Hour",
            "2x Catch Stardust, 2x Catch XP, 2x Catch Candy, 2x Transfer Candy, 2x Evolution XP"
        );
        assert.equal(bonuses.length, 2); // Spotlight Hour caps at 2
    });

    test("ignores bonuses the event type does not offer", () => {
        assert.deepEqual(extractBonusesFromDetails("Raid Hour", "3x Catch Stardust"), []);
    });

    test("returns empty for an unknown event type", () => {
        assert.deepEqual(extractBonusesFromDetails("Nonsense Day", "3x Catch Stardust"), []);
    });
});

describe("renderDescription", () => {
    // Golden outputs captured from the pre-refactor code, so collapsing the two
    // description builders into one provably did not change the wording.
    test("raid event: CP line with weather-boosted value", () => {
        assert.equal(renderDescription({
            eventType: "Raid Hour",
            pokemon: "Ho-Oh",
            location: "Sundance Park",
            formattedDate: "August 12th",
            hundo: 2207,
            whundo: 2759,
            shinyAvailable: true
        }), [
            "Ho-Oh Raid Hour",
            "🎈 Join us at Sundance Park on August 12th for the Ho-Oh Raid Hour from 6-7PM 💃☀️🕺",
            "",
            "💯 - 2207 / WB - 2759",
            "",
            "If you're lucky, you might encounter a shiny one ✨",
            '✅ "Check in" on Campfire when you arrive'
        ].join("\n"));
    });

    test("Max Battles: CP line without the weather-boosted value", () => {
        const out = renderDescription({
            eventType: "Max Battles",
            pokemon: "Charizard",
            formattedDate: "August 20th",
            hundo: 1645
        });
        assert.match(out, /💯 - 1645\n/);
        assert.doesNotMatch(out, /WB -/);
    });

    test("singular vs plural bonus header", () => {
        const one = renderDescription({
            eventType: "Spotlight Hour",
            pokemon: "Porygon-Z",
            formattedDate: "August 13th",
            bonuses: ["2x Catch Candy"],
            shinyAvailable: true
        });
        assert.equal(one, [
            "Porygon-Z Spotlight Hour",
            "🎈 Join us at Sundance Park on August 13th for the Porygon-Z Spotlight Hour from 6-7PM 💃☀️🕺",
            "",
            "————Event Bonus————",
            "- 2x Catch Candy",
            "",
            "If you're lucky, you might encounter a shiny one ✨",
            '✅ "Check in" on Campfire when you arrive'
        ].join("\n"));

        const many = renderDescription({
            eventType: "Spotlight Hour",
            pokemon: "Pikachu",
            formattedDate: "August 13th",
            bonuses: ["2x Catch Candy", "2x Catch XP"]
        });
        assert.match(many, /————Event Bonuses————/);
    });

    test("omits the shiny line when shiny is unavailable", () => {
        const out = renderDescription({
            eventType: "Spotlight Hour",
            pokemon: "Bidoof",
            formattedDate: "August 13th",
            shinyAvailable: false
        });
        assert.doesNotMatch(out, /shiny one/);
        assert.match(out, /Check in/);
    });

    test("featured attack only appears for event types that collect one", () => {
        const cd = renderDescription({
            eventType: "Community Day",
            pokemon: "Charmander",
            formattedDate: "August 16th",
            attack: "Blast Burn"
        });
        assert.match(cd, /Evolve for featured attack: Blast Burn/);

        // Spotlight Hour has no "attack" special field, so an attack is ignored.
        const sh = renderDescription({
            eventType: "Spotlight Hour",
            pokemon: "Charmander",
            formattedDate: "August 16th",
            attack: "Blast Burn"
        });
        assert.doesNotMatch(sh, /featured attack/);
    });

    test("defaults the location", () => {
        const out = renderDescription({ eventType: "Hatch Day", pokemon: "Togepi", formattedDate: "August 9th" });
        assert.match(out, /Join us at Sundance Park/);
    });

    test("throws on an unknown event type rather than emitting nonsense", () => {
        assert.throws(() => renderDescription({ eventType: "Nope", pokemon: "X", formattedDate: "y" }), /Unknown event type/);
    });
});

describe("parseBulkTable", () => {
    const table = `
| Event Name | Details | Date |
| --- | --- | --- |
| **Charizard Raid Day** | Boosted shiny | August 15 |
| Ho-Oh Raid Hour | shiny | August 12 |
not a table row
| too | few |
`;

    test("extracts rows, skipping header, separator and non-rows", () => {
        const rows = parseBulkTable(table);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[0], { name: "Charizard Raid Day", details: "Boosted shiny", date: "August 15" });
        assert.equal(rows[1].name, "Ho-Oh Raid Hour");
    });

    test("strips bold markers and leading decoration", () => {
        assert.equal(parseBulkTable("| **✨ Charizard Raid Day** | x | August 15 |")[0].name, "Charizard Raid Day");
    });

    test("returns empty for input that is not a table", () => {
        assert.deepEqual(parseBulkTable("just some prose"), []);
    });
});

describe("parseDateString", () => {
    test("resolves a month/day against the current year", () => {
        assert.equal(parseDateString("August 15", NOW), "2026-08-15");
        assert.equal(parseDateString("Aug 5", NOW), "2026-08-05");
    });

    test("rolls into next year once the month has passed", () => {
        assert.equal(parseDateString("January 10", NOW), "2027-01-10");
    });

    test("returns null for unparseable input", () => {
        assert.equal(parseDateString("sometime soon", NOW), null);
        assert.equal(parseDateString("Smarch 4", NOW), null);
    });
});

describe("formatDate", () => {
    test("adds the right ordinal suffix", () => {
        assert.equal(formatDate("2026-08-01", NOW), "August 1st");
        assert.equal(formatDate("2026-08-02", NOW), "August 2nd");
        assert.equal(formatDate("2026-08-03", NOW), "August 3rd");
        assert.equal(formatDate("2026-08-04", NOW), "August 4th");
        assert.equal(formatDate("2026-08-21", NOW), "August 21st");
    });

    test("uses 'th' for the 11-13 exceptions", () => {
        assert.equal(formatDate("2026-08-11", NOW), "August 11th");
        assert.equal(formatDate("2026-08-12", NOW), "August 12th");
        assert.equal(formatDate("2026-08-13", NOW), "August 13th");
    });

    test("returns null for a date already past", () => {
        assert.equal(formatDate("2026-07-31", NOW), null);
    });

    test("accepts today", () => {
        assert.equal(formatDate("2026-08-01", NOW), "August 1st");
    });

    test("returns null for garbage", () => {
        assert.equal(formatDate("not-a-date", NOW), null);
    });
});

describe("getDaySuffix", () => {
    test("covers the whole month", () => {
        const suffixes = Array.from({ length: 31 }, (_, i) => getDaySuffix(i + 1));
        assert.equal(suffixes[0], "st");   // 1
        assert.equal(suffixes[10], "th");  // 11
        assert.equal(suffixes[11], "th");  // 12
        assert.equal(suffixes[12], "th");  // 13
        assert.equal(suffixes[20], "st");  // 21
        assert.equal(suffixes[21], "nd");  // 22
        assert.equal(suffixes[22], "rd");  // 23
        assert.equal(suffixes[30], "st");  // 31
    });
});

describe("indexBaseStats", () => {
    // Regression: PoGoAPI lists Galarian Articuno *before* Normal Articuno, so
    // "first match wins" returned the regional variant — 2051 CP instead of 1743.
    const articuno = [
        { name: "Articuno", atk: 250, def: 197, sta: 207, form: "Galarian" },
        { name: "Articuno", atk: 192, def: 236, sta: 207, form: "Normal" }
    ];

    test("prefers the Normal form even when it is not listed first", () => {
        const index = indexBaseStats(articuno);
        assert.deepEqual(index.get("articuno"), { base_attack: 192, base_defense: 236, base_stamina: 207 });
        assert.equal(calcCatchCP(index.get("articuno")).hundo, 1743);
    });

    test("keeps the Normal form when it comes first too", () => {
        const index = indexBaseStats([...articuno].reverse());
        assert.equal(index.get("articuno").base_attack, 192);
    });

    test("falls back to the first entry when no Normal form exists", () => {
        const index = indexBaseStats([
            { name: "Tatsugiri", atk: 1, def: 2, sta: 3, form: "Curly" },
            { name: "Tatsugiri", atk: 9, def: 9, sta: 9, form: "Droopy" }
        ]);
        assert.equal(index.get("tatsugiri").base_attack, 1);
    });

    test("treats a missing form field as Normal", () => {
        const index = indexBaseStats([{ name: "Charizard", atk: 223, def: 173, sta: 186 }]);
        assert.equal(index.get("charizard").base_attack, 223);
    });

    test("indexes on the normalized name", () => {
        const index = indexBaseStats([{ name: "Ho-Oh", atk: 239, def: 244, sta: 214 }]);
        assert.ok(index.get("ho oh"));
    });

    // Form-qualified names have no entry of their own — the API stores them as
    // name + form — so a combined key is what makes them resolvable at all.
    test("registers form-qualified keys alongside the bare name", () => {
        const index = indexBaseStats([
            { name: "Deoxys", atk: 414, def: 46, sta: 137, form: "Attack" },
            { name: "Deoxys", atk: 144, def: 330, sta: 137, form: "Defense" },
            { name: "Deoxys", atk: 345, def: 115, sta: 137, form: "Normal" }
        ]);
        assert.equal(index.get("deoxys attack").base_attack, 414);
        assert.equal(index.get("deoxys defense").base_attack, 144);
        assert.equal(index.get("deoxys").base_attack, 345, "bare name resolves to Normal");
    });

    test("accepts either spelling of a regional form", () => {
        const index = indexBaseStats([
            { name: "Exeggutor", atk: 233, def: 149, sta: 216, form: "Alola" },
            { name: "Exeggutor", atk: 233, def: 149, sta: 190, form: "Normal" }
        ]);
        assert.ok(index.get("exeggutor alola"), "API spelling");
        assert.ok(index.get("exeggutor alolan"), "the spelling humans write");
        assert.equal(index.get("exeggutor alolan").base_stamina, 216);
        assert.equal(index.get("exeggutor").base_stamina, 190, "bare name stays Normal");
    });

    test("matches parenthesised form names as written in schedules", () => {
        const index = indexBaseStats([
            { name: "Giratina", atk: 187, def: 225, sta: 284, form: "Altered" },
            { name: "Giratina", atk: 225, def: 187, sta: 284, form: "Origin" }
        ]);
        assert.equal(index.get(normalizeName("Giratina (Origin)")).base_attack, 225);
        assert.equal(index.get(normalizeName("Giratina (Altered)")).base_attack, 187);
    });
});

describe("pokeApiSlug", () => {
    test("handles plain and hyphenated names", () => {
        assert.equal(pokeApiSlug("Charizard"), "charizard");
        assert.equal(pokeApiSlug("Ho-Oh"), "ho-oh");
        assert.equal(pokeApiSlug("Mr. Mime"), "mr-mime");
        assert.equal(pokeApiSlug("Farfetch'd"), "farfetchd");
    });

    // Regression: parenthesised names produced "giratina-(origin)", a 400.
    test("strips parentheses from form-qualified names", () => {
        assert.equal(pokeApiSlug("Giratina (Origin)"), "giratina-origin");
        assert.equal(pokeApiSlug("Deoxys Attack"), "deoxys-attack");
    });

    test("translates regional spellings to PokéAPI's", () => {
        assert.equal(pokeApiSlug("Marowak (Alolan)"), "marowak-alola");
        assert.equal(pokeApiSlug("Exeggutor (Alolan)"), "exeggutor-alola");
        assert.equal(pokeApiSlug("Articuno (Galarian)"), "articuno-galar");
    });

    test("returns an empty string for an empty name", () => {
        assert.equal(pokeApiSlug(""), "");
    });
});

describe("calcCatchCP", () => {
    test("computes both catch levels from base stats", () => {
        assert.deepEqual(
            calcCatchCP({ base_attack: 100, base_defense: 100, base_stamina: 100 }),
            { hundo: 471, whundo: 590 }
        );
    });

    test("weather-boosted CP is always the higher of the two", () => {
        const cp = calcCatchCP({ base_attack: 223, base_defense: 173, base_stamina: 186 });
        assert.ok(cp.whundo > cp.hundo);
    });
});

describe("misc helpers", () => {
    test("normalizeName folds case, punctuation and spacing", () => {
        assert.equal(normalizeName("Ho-Oh"), "ho oh");
        assert.equal(normalizeName("  HO   OH "), "ho oh");
        assert.equal(normalizeName("Exeggutor (Alolan)"), "exeggutor alolan");
        assert.equal(normalizeName("Mr. Mime"), "mr mime");
        assert.equal(normalizeName("Mr_mime"), "mr mime");
        // Apostrophes vanish rather than splitting the word
        assert.equal(normalizeName("Farfetch'd"), "farfetchd");
        assert.equal(normalizeName("Farfetchd"), "farfetchd");
    });

    test("mapEventTypeFromName prefers the longest match", () => {
        assert.equal(mapEventTypeFromName("Charmander Community Day Classic"), "Community Day Classic");
        assert.equal(mapEventTypeFromName("Charmander Community Day"), "Community Day");
        assert.equal(mapEventTypeFromName("Max Battle Day"), "Max Battles");
        assert.equal(mapEventTypeFromName("Bake Sale"), null);
    });

    test("extractAttackFromDetails reads gets/learns phrasing", () => {
        assert.equal(extractAttackFromDetails("Charizard gets Blast Burn, plus bonuses"), "Blast Burn");
        assert.equal(extractAttackFromDetails("learns Frenzy Plant."), "Frenzy Plant");
        assert.equal(extractAttackFromDetails("no attack here"), "");
    });

    test("isShinyInDetails is a plain keyword check", () => {
        assert.equal(isShinyInDetails("Boosted shiny odds"), true);
        assert.equal(isShinyInDetails("nothing special"), false);
    });
});

describe("parseEventRow", () => {
    test("builds a complete row from a schedule entry", () => {
        const row = parseEventRow({ name: "Ho-Oh Raid Hour", details: "Boosted shiny raids", date: "August 12" }, NOW);
        assert.equal(row.ok, true);
        assert.equal(row.eventType, "Raid Hour");
        assert.equal(row.pokemon, "Ho-Oh");
        assert.equal(row.formattedDate, "August 12th");
        assert.equal(row.needsCP, true, "Raid Hour shows a CP line");
    });

    test("flags rows whose event type cannot be identified", () => {
        const row = parseEventRow({ name: "Mystery Gathering", details: "unclear", date: "August 20" }, NOW);
        assert.equal(row.ok, false);
        assert.match(row.reason, /event type/);
    });

    test("flags rows whose date cannot be parsed", () => {
        assert.equal(parseEventRow({ name: "Charizard Raid Day", details: "x", date: "whenever" }, NOW).ok, false);
    });

    test("a day already gone in the current month is rejected", () => {
        const midAugust = new Date("2026-08-20T12:00:00");
        assert.equal(parseEventRow({ name: "Charizard Raid Day", details: "x", date: "August 5" }, midAugust).ok, false);
    });

    test("an earlier month is read as next year, not as the past", () => {
        // Pasting a January schedule in August means next January.
        const row = parseEventRow({ name: "Charizard Raid Day", details: "x", date: "January 10" }, NOW);
        assert.equal(row.ok, true);
        assert.equal(row.formattedDate, "January 10th");
    });

    test("asks for CP only when the event type shows a CP line", () => {
        const raid = parseEventRow({ name: "Fakemon Raid Day", details: "x", date: "August 20" }, NOW);
        assert.equal(raid.needsCP, true);

        const spotlight = parseEventRow({ name: "Fakemon Spotlight Hour", details: "x", date: "August 20" }, NOW);
        assert.equal(spotlight.needsCP, false);
    });

    test("only collects a featured attack for types that use one", () => {
        const cd = parseEventRow({ name: "Charmander Community Day", details: "Charmander gets Blast Burn", date: "August 16" }, NOW);
        assert.equal(cd.attack, "Blast Burn");

        const sh = parseEventRow({ name: "Charmander Spotlight Hour", details: "Charmander gets Blast Burn", date: "August 16" }, NOW);
        assert.equal(sh.attack, "");
    });
});
