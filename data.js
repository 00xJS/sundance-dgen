/**
 * Everything that reaches outside the page.
 *
 * Catch CP is derived from Pokémon GO base stats rather than stored, so it
 * cannot drift out of date. Lookups resolve in three tiers, cheapest first:
 *   1. cpOverrides.js                  — manual pins; normally empty
 *   2. the vendored snapshot in data/  — same origin, refreshed weekly by CI
 *   3. the live APIs                   — only when the snapshot misses
 *
 * Tier 3 exists so a Pokémon released after the last snapshot still resolves.
 * Every call is best-effort: callers get null rather than an exception, and the
 * status chip tells the user which tier is actually answering.
 */

import { calcCatchCP, normalizeName, lookupCPOverride, indexBaseStats, pokeApiSlug } from './parse.js';

const TIMEOUT_MS = 8000;

const SNAPSHOT = {
    stats: './data/pokemon-stats.json',
    shiny: './data/shiny-pokemon.json'
};

const LIVE = {
    names: 'https://pokeapi.co/api/v2/pokemon?limit=2000',
    stats: 'https://pogoapi.net/api/v1/pokemon_stats.json',
    shiny: 'https://pogoapi.net/api/v1/shiny_pokemon.json',
    pokemon: name => `https://pokeapi.co/api/v2/pokemon/${pokeApiSlug(name)}`,
    artwork: id => `https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/${id}.png`
};

// ---------------------------------------------------------------- status ----

const status = { source: 'loading', generated: null };
const listeners = new Set();

export function getStatus() {
    return { ...status };
}

/** Subscribe to data-source changes; fires immediately with the current state. */
export function onStatusChange(fn) {
    listeners.add(fn);
    fn(getStatus());
    return () => listeners.delete(fn);
}

function setStatus(patch) {
    Object.assign(status, patch);
    for (const fn of listeners) fn(getStatus());
}

// ----------------------------------------------------------------- fetch ----

async function getJSON(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${response.status} for ${url}`);
    return response.json();
}

/** Run a loader once and cache the promise, so concurrent callers share one request. */
function once(fn) {
    let promise = null;
    return () => (promise ??= fn().catch(error => {
        promise = null;                       // let a later call retry
        throw error;
    }));
}

// ------------------------------------------------------------ base stats ----

/** Display names from whichever stats source loaded — the autocomplete fallback. */
let statsNames = [];

const loadSnapshotStats = once(async () => {
    const snapshot = await getJSON(SNAPSHOT.stats);
    setStatus({ source: 'snapshot', generated: snapshot.generated ?? null });
    const pokemon = snapshot.pokemon ?? [];
    statsNames = pokemon.map(p => p.name);
    return indexBaseStats(pokemon);
});

const loadLiveStats = once(async () => {
    const live = await getJSON(LIVE.stats);
    const pokemon = live.map(p => ({
        name: p.pokemon_name, atk: p.base_attack, def: p.base_defense, sta: p.base_stamina, form: p.form
    }));
    if (!statsNames.length) statsNames = [...new Set(pokemon.map(p => p.name))];
    return indexBaseStats(pokemon);
});

const ensureStats = once(async () => {
    try {
        return await loadSnapshotStats();
    } catch {
        // No snapshot deployed (or unreadable) — fall back to the live API.
        try {
            const index = await loadLiveStats();
            setStatus({ source: 'live', generated: null });
            return index;
        } catch {
            setStatus({ source: 'offline', generated: null });
            return null;
        }
    }
});

/**
 * Start loading the data snapshot without needing a lookup to trigger it, so
 * the status chip settles on page load rather than on first use.
 */
export function primeData() {
    return ensureStats();
}

/**
 * Catch CP for a Pokémon, or null if it cannot be resolved.
 *
 * Derived from current base stats, so it cannot go stale. A manual override
 * wins if one exists, but that map is normally empty — see cpOverrides.js.
 */
export async function getCatchCP(name) {
    if (!name) return null;

    const pinned = lookupCPOverride(name);
    if (pinned) return pinned;

    const target = normalizeName(name);
    const stats = await ensureStats();
    const hit = stats?.get(target);
    if (hit) return calcCatchCP(hit);

    // Absent from the snapshot may just mean "released since it was taken".
    if (status.source === 'snapshot') {
        try {
            const live = await loadLiveStats();
            const liveHit = live.get(target);
            if (liveHit) return calcCatchCP(liveHit);
        } catch { /* live unavailable — nothing more to try */ }
    }
    return null;
}

// ------------------------------------------------------------ shiny list ----

const loadSnapshotShiny = once(async () => {
    const snapshot = await getJSON(SNAPSHOT.shiny);
    return new Set((snapshot.names ?? []).map(normalizeName));
});

const loadLiveShiny = once(async () => {
    const live = await getJSON(LIVE.shiny);
    return new Set(Object.values(live).map(entry => normalizeName(entry.name)));
});

const ensureShiny = once(async () => {
    try {
        return await loadSnapshotShiny();
    } catch {
        try {
            return await loadLiveShiny();
        } catch {
            return null;
        }
    }
});

/** true / false if known, null if no shiny data could be loaded at all. */
export async function isShinyReleased(name) {
    if (!name) return null;
    const set = await ensureShiny();
    if (!set) return null;

    const target = normalizeName(name);
    if (set.has(target)) return true;

    // A miss against the snapshot might be a recent release; confirm against live.
    if (status.source === 'snapshot') {
        try {
            const live = await loadLiveShiny();
            return live.has(target);
        } catch { /* fall through to the snapshot's answer */ }
    }
    return false;
}

// ------------------------------------------------------------ name list ----

/**
 * Full Pokémon name list for autocomplete. Falls back to the names in the stats
 * snapshot, which is same-origin and therefore available whenever the page is.
 */
export async function loadPokemonNames() {
    try {
        const data = await getJSON(LIVE.names);
        return data.results.map(p => p.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    } catch (error) {
        console.error('Pokémon name list unavailable, falling back to the stats snapshot:', error);
        await ensureStats();
        return [...statsNames].sort();
    }
}

// -------------------------------------------------------------- artwork ----

/** Official artwork URL for a Pokémon, or null if it can't be resolved. */
export async function fetchPokemonImage(name) {
    try {
        const data = await getJSON(LIVE.pokemon(name));
        return LIVE.artwork(String(data.id).padStart(3, '0'));
    } catch (error) {
        console.error(`No artwork for ${name}:`, error);
        return null;
    }
}
