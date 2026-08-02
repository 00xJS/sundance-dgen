#!/usr/bin/env node
/**
 * Refresh the vendored data snapshots in data/.
 *
 * PoGoAPI is a volunteer project. Fetching it at page load means a description
 * can silently lose its CP or shiny line the day that service has a bad hour —
 * the worst kind of failure, because nothing looks broken. Committing a trimmed
 * snapshot turns that runtime dependency into a repo file; the live API is kept
 * only as a fallback for Pokémon released since the last refresh.
 *
 *   npm run refresh-data
 *
 * Run weekly by .github/workflows/refresh-data.yml.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { calcCatchCP, indexBaseStats, normalizeName, CATCHABLE_FORMS } from "../parse.js";
import { cpOverrides } from "../cpOverrides.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data");

const SOURCES = {
    stats: "https://pogoapi.net/api/v1/pokemon_stats.json",
    shiny: "https://pogoapi.net/api/v1/shiny_pokemon.json"
};

async function getJSON(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.json();
}

/**
 * Reduce each entry to a name, its form, and the three stats the CP formula
 * needs.
 *
 * Every form is kept, not just the base one. Form-qualified names like
 * "Deoxys Attack" and "Giratina (Origin)" have no entry of their own — the API
 * models them as name + form — so dropping the alternates would make them
 * unresolvable, and their CP line would silently come out blank.
 *
 * Choosing *which* form a bare name resolves to is the runtime indexer's job
 * (see indexBaseStats and CATCHABLE_FORMS); this only decides what gets stored.
 */
function trimStats(raw) {
    const seen = new Set();
    const pokemon = [];

    for (const entry of raw) {
        const name = entry.pokemon_name;
        if (!name) continue;
        const key = `${name}::${entry.form ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pokemon.push({
            name,
            form: entry.form,
            atk: entry.base_attack,
            def: entry.base_defense,
            sta: entry.base_stamina
        });
    }
    return pokemon;
}

function trimShiny(raw) {
    const names = new Set();
    for (const entry of Object.values(raw)) {
        const name = Array.isArray(entry) ? entry[0]?.name : entry?.name;
        if (name) names.add(name);
    }
    return [...names].sort();
}

async function main() {
    const generated = new Date().toISOString();

    const [rawStats, rawShiny] = await Promise.all([
        getJSON(SOURCES.stats),
        getJSON(SOURCES.shiny)
    ]);

    const pokemon = trimStats(rawStats);
    const names = trimShiny(rawShiny);

    if (pokemon.length < 500) throw new Error(`Only ${pokemon.length} Pokémon in stats — refusing to write a truncated snapshot`);
    if (names.length < 200) throw new Error(`Only ${names.length} shiny names — refusing to write a truncated snapshot`);

    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(
        resolve(DATA_DIR, "pokemon-stats.json"),
        JSON.stringify({ generated, source: SOURCES.stats, pokemon }) + "\n"
    );
    await writeFile(
        resolve(DATA_DIR, "shiny-pokemon.json"),
        JSON.stringify({ generated, source: SOURCES.shiny, names }) + "\n"
    );

    console.log(`Wrote ${pokemon.length} Pokémon stats and ${names.length} shiny names (generated ${generated}).`);
    auditOverrides(pokemon);
    checkResolvable(pokemon);
}

/**
 * CP is derived, so nothing here can go stale — except cpOverrides.js, whose
 * values nothing re-checks. Report any override that now agrees with the
 * derived value (safe to delete) or that no longer resolves at all.
 */
function auditOverrides(pokemon) {
    const entries = Object.entries(cpOverrides);
    if (!entries.length) {
        console.log("No CP overrides defined — every value is derived from base stats.");
        return;
    }

    const index = indexBaseStats(pokemon);
    const redundant = [];
    const unresolvable = [];

    for (const [name, pinned] of entries) {
        const stats = index.get(normalizeName(name));
        if (!stats) {
            unresolvable.push(name);
            continue;
        }
        const derived = calcCatchCP(stats);
        if (derived.hundo === pinned.hundo && derived.whundo === pinned.whundo) redundant.push(name);
    }

    console.log(`\n${entries.length} CP override(s) defined.`);
    if (redundant.length) {
        console.log(`  ${redundant.length} now match the derived value and can be deleted: ${redundant.join(", ")}`);
    }
    if (unresolvable.length) {
        console.log(`  ${unresolvable.length} name(s) no longer appear in the stats data: ${unresolvable.join(", ")}`);
    }
}

/**
 * Spot-check that names the tool is actually asked for still resolve — including
 * the form-qualified spellings, which depend on the form-key indexing.
 */
function checkResolvable(pokemon) {
    const index = indexBaseStats(pokemon);
    const samples = [
        "Charizard", "Ho-Oh", "Mr. Mime", "Deoxys Attack", "Deoxys Speed",
        "Exeggutor (Alolan)", "Marowak (Alolan)", "Giratina (Altered)", "Giratina (Origin)",
        "Thundurus (Incarnate)", "Tornadus (Incarnate)", "Zacian", "Zamazenta", "Articuno"
    ];
    const missing = samples.filter(name => !index.get(normalizeName(name)));

    if (missing.length) {
        console.log(`\nWARNING — these names no longer resolve from the stats data: ${missing.join(", ")}`);
        console.log("Autocomplete will still offer them, but their CP line will come out blank.");
    } else {
        console.log(`All ${samples.length} sampled names resolve, form-qualified spellings included.`);
    }
}


main().catch(error => {
    console.error("Data refresh failed:", error.message);
    process.exit(1);
});
