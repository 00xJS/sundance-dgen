/**
 * Pure functions: parsing, formatting and rendering.
 *
 * Nothing in this file touches the DOM, the network, or the clock unless a
 * value is passed in — which is what makes it testable. See test/parse.test.js.
 */

import { eventConfig, constants, eventTypeAliases, bonusPatterns, CPM } from './config.js';
import { cpOverrides } from './cpOverrides.js';

/**
 * Fold a Pokémon name to a comparable key.
 *
 * Sources punctuate inconsistently — "Ho-Oh" / "Ho Oh", "Exeggutor (Alolan)" /
 * "Exeggutor Alola", "Mr. Mime" / "Mr_mime", "Farfetch'd" / "Farfetchd" — so
 * apostrophes are dropped and every other separator collapses to one space.
 */
export function normalizeName(name) {
    return String(name)
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function getDaySuffix(day) {
    if (day >= 11 && day <= 13) return "th";
    switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

/**
 * "2026-08-15" -> "August 15th". Returns null for a date in the past, which is
 * how callers detect a schedule row that has already happened.
 */
export function formatDate(inputDate, today = new Date()) {
    const midnight = new Date(today);
    midnight.setHours(0, 0, 0, 0);
    const date = new Date(inputDate + "T00:00:00");
    if (isNaN(date.getTime()) || date < midnight) return null;
    const day = date.getDate();
    return date
        .toLocaleDateString("en-US", { month: "long", day: "numeric" })
        .replace(String(day), `${day}${getDaySuffix(day)}`);
}

/** Pull `{ name, details, date }` rows out of a pasted markdown table. */
export function parseBulkTable(text) {
    const events = [];
    for (const line of String(text).trim().split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|")) continue;
        if (/^\|[-\s|:]+\|$/.test(trimmed)) continue;               // separator row
        const cols = trimmed.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
        if (cols.length < 3) continue;
        if (/event name/i.test(cols[0])) continue;                  // header row
        const [rawName, details, date] = cols;
        const name = rawName.replace(/\*\*/g, "").replace(/^[^\w]+/, "").trim();
        if (name && details && date) events.push({ name, details, date });
    }
    return events;
}

export function mapEventTypeFromName(name) {
    const n = String(name).toLowerCase();
    for (const [fragment, type] of eventTypeAliases) {
        if (n.includes(fragment)) return type;
    }
    return null;
}

/**
 * Separate the Pokémon from the event type in a schedule row's name.
 *
 * Only en/em dashes, or a hyphen surrounded by whitespace, count as separators.
 * A bare hyphen belongs to the Pokémon — Ho-Oh, Porygon-Z, Jangmo-o — and
 * splitting on it produced names like "Oh Raid Hour".
 */
export function extractPokemonFromEvent(name) {
    const dashMatch = String(name).match(/(?:[–—]|\s-\s)\s*(.+)$/);
    if (dashMatch) return dashMatch[1].trim();

    const typePatterns = [
        "Community Day Classic", "Community Day", "Hatch Day",
        "Raid Day", "Raid Hour", "Spotlight Hour", "Research Day", "Max Battle Day", "Max Battles"
    ];
    for (const pattern of typePatterns) {
        const idx = name.toLowerCase().indexOf(pattern.toLowerCase());
        if (idx > 0) return name.substring(0, idx).replace(/^Replay:\s*/i, "").trim();
    }
    return "";
}

/**
 * Split a featured-Pokémon string into individual names.
 *
 * Events regularly feature several: "Articuno, Zapdos & Moltres Raid Hour",
 * "Magby and Smoochum Hatch Day". Used only for CP and artwork lookups — the
 * title keeps the original wording, so a themed name that isn't really a list
 * ("Fire and Ice Hatch Day") still reads correctly, it just resolves nothing.
 */
export function splitPokemonNames(text) {
    if (!text) return [];
    return String(text)
        .split(/\s*(?:,|&|\band\b|\bor\b)\s*/i)
        .map(part => part.trim())
        .filter(Boolean);
}

/**
 * "August 15" -> "2026-08-15".
 *
 * An explicit year in the text always wins: "July 4, 2026" means 2026, even
 * when that date has already passed (the caller then reports it as past, which
 * is honest — silently moving it to 2027 was not).
 *
 * Only when no year is written is one implied: the current year, rolling
 * forward if that month has already been and gone, so a January schedule
 * pasted in December lands next January rather than being rejected.
 */
export function parseDateString(dateStr, now = new Date()) {
    const monthMap = {
        jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
        apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
        aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
        nov: 11, november: 11, dec: 12, december: 12
    };
    const text = String(dateStr);
    const match = text.match(/([A-Za-z]+)\s+(\d+)/);
    if (!match) return null;
    const month = monthMap[match[1].toLowerCase()];
    const day = parseInt(match[2], 10);
    if (!month || !day) return null;

    // A 4-digit number anywhere in the cell is the year. Guard against reading
    // the day itself by requiring 4 digits — "July 4" has no year, "July 4-6,
    // 2026" does. Ranges collapse to the first day.
    const explicitYear = text.match(/\b(20\d{2})\b/);
    const year = explicitYear
        ? parseInt(explicitYear[1], 10)
        : now.getFullYear() + (month < now.getMonth() + 1 ? 1 : 0);

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Keyword-match the details column against the bonuses this event type allows. */
export function extractBonusesFromDetails(eventType, details) {
    const config = eventConfig[eventType];
    if (!config || !config.bonuses.length) return [];
    const found = [];
    for (const { re, bonus } of bonusPatterns) {
        if (!re.test(details)) continue;
        const candidates = Array.isArray(bonus) ? bonus : [bonus];
        const matched = candidates.find(b => config.bonuses.includes(b) && !found.includes(b));
        if (!matched) continue;
        found.push(matched);
        if (found.length >= config.maxBonuses) break;
    }
    return found;
}

export function extractAttackFromDetails(details) {
    const match = String(details).match(/(?:gets|learns)\s+([A-Z][A-Za-z\s]+?)(?:[,.]|$)/);
    return match ? match[1].trim() : "";
}

export function isShinyInDetails(details) {
    return /shiny/i.test(String(details));
}

/**
 * A manually pinned CP, or null when the derived value should be used.
 * Normally null — see cpOverrides.js for when an entry is justified.
 */
export function lookupCPOverride(pokemonName) {
    const target = normalizeName(pokemonName);
    const key = Object.keys(cpOverrides).find(k => normalizeName(k) === target);
    return key ? cpOverrides[key] : null;
}

/**
 * Forms that represent the Pokémon you actually catch, best first.
 *
 * "Normal" covers almost everything. "Hero" exists for Zacian and Zamazenta,
 * which have no Normal form — raids give Hero of Many Battles, while their
 * Crowned forms need an item and are not catchable.
 */
export const CATCHABLE_FORMS = ["Normal", "Hero"];

/**
 * Regional form names that sources spell differently. Each entry is indexed
 * under every spelling, so "Exeggutor (Alolan)" and "Exeggutor Alola" both hit.
 */
const FORM_SPELLINGS = {
    alola: ["alola", "alolan"],
    alolan: ["alola", "alolan"],
    galar: ["galar", "galarian"],
    galarian: ["galar", "galarian"],
    hisui: ["hisui", "hisuian"],
    hisuian: ["hisui", "hisuian"],
    paldea: ["paldea", "paldean"],
    paldean: ["paldea", "paldean"]
};

/**
 * Index base stats for lookup by bare name *and* by name + form.
 *
 * Two problems this solves:
 *
 * 1. PoGoAPI lists several forms under one name and does NOT put the base form
 *    first — Galarian Articuno precedes Normal Articuno, Crowned Sword Zacian
 *    precedes Hero. "First match wins" returns the wrong variant's stats and a
 *    visibly wrong catch CP, so the bare name resolves via CATCHABLE_FORMS.
 *
 * 2. Form-qualified names ("Deoxys Attack", "Giratina (Origin)") have no entry
 *    of their own — the API stores them as name + form. Registering a combined
 *    key makes them resolvable without hardcoding their CP anywhere.
 *
 * @param entries [{ name, atk, def, sta, form? }]
 */
export function indexBaseStats(entries) {
    const index = new Map();
    const rank = new Map();

    // Lower is better; anything unrecognised sorts last but still beats nothing.
    const rankOf = form => {
        if (form === undefined) return 0;
        const i = CATCHABLE_FORMS.indexOf(form);
        return i === -1 ? CATCHABLE_FORMS.length : i;
    };

    for (const entry of entries) {
        if (!entry?.name) continue;

        const stats = {
            base_attack: entry.atk,
            base_defense: entry.def,
            base_stamina: entry.sta
        };

        // Bare name — contested between forms, so the best-ranked one wins.
        const bare = normalizeName(entry.name);
        const score = rankOf(entry.form);
        if (!index.has(bare) || rank.get(bare) > score) {
            index.set(bare, stats);
            rank.set(bare, score);
        }

        // Form-qualified keys — unambiguous, first writer wins.
        if (entry.form === undefined) continue;
        const form = normalizeName(entry.form);
        for (const spelling of FORM_SPELLINGS[form] ?? [form]) {
            const key = `${bare} ${spelling}`;
            if (!index.has(key)) index.set(key, stats);
        }
    }
    return index;
}

/**
 * PokéAPI's slug for a Pokémon name, used to look up artwork.
 *
 * Regional forms are spelled differently there than in schedules — PokéAPI says
 * `marowak-alola`, people write "Marowak (Alolan)" — and punctuation has to go,
 * or the request 400s.
 */
const SLUG_FORM_ALIASES = {
    alolan: "alola",
    galarian: "galar",
    hisuian: "hisui",
    paldean: "paldea"
};

export function pokeApiSlug(name) {
    const parts = normalizeName(name).split(" ").filter(Boolean);
    if (!parts.length) return "";
    const last = parts.length - 1;
    parts[last] = SLUG_FORM_ALIASES[parts[last]] ?? parts[last];
    return parts.join("-");
}

/** Catch CP from raw Pokémon GO base stats, at both raid catch levels. */
export function calcCatchCP({ base_attack, base_defense, base_stamina }) {
    const at = cpm => Math.floor(
        (base_attack + 15) * Math.sqrt(base_defense + 15) * Math.sqrt(base_stamina + 15) * cpm * cpm / 10
    );
    return { hundo: at(CPM.level20), whundo: at(CPM.level25) };
}

/**
 * The one place the description text is assembled. Both the manual builder and
 * the bulk importer call this, so the two can no longer drift apart.
 *
 * Which optional lines appear is derived from the event type's `specialFields`,
 * not from its name.
 */
export function renderDescription({
    eventType,
    pokemon,
    location = constants.defaultLocation,
    formattedDate,
    bonuses = [],
    hundo = "",
    whundo = "",
    cpList = [],
    attack = "",
    shinyAvailable = false
}) {
    const config = eventConfig[eventType];
    if (!config) throw new Error(`Unknown event type: ${eventType}`);

    // Some events have no Pokémon to name — an unannounced Raid Hour is just
    // "Raid Hour", not "Raid Hour Raid Hour".
    const title = pokemon ? `${pokemon} ${eventType}` : eventType;

    let body = `from ${config.time} ${constants.eventEmojis}\n\n`;

    if (bonuses.length) {
        const header = bonuses.length > 1 ? constants.bonusHeaderMultiple : constants.bonusHeaderSingle;
        body += `${header}\n${bonuses.map(b => `- ${b}`).join("\n")}\n\n`;
    }
    if (config.specialFields.includes("hundo")) {
        const withWB = config.specialFields.includes("whundo");
        if (cpList.length > 1) {
            // Several featured Pokémon — label each line so a reader can tell
            // which CP belongs to which boss.
            body += cpList
                .map(cp => withWB
                    ? `💯 ${cp.name} - ${cp.hundo} / WB - ${cp.whundo}`
                    : `💯 ${cp.name} - ${cp.hundo}`)
                .join("\n") + "\n\n";
        } else if (String(hundo).trim()) {
            // Only print the CP line once there is a CP to print. An empty
            // "💯 -  / WB - " is worse than no line at all in a public post.
            body += withWB ? `💯 - ${hundo} / WB - ${whundo}\n\n` : `💯 - ${hundo}\n\n`;
        }
    }
    if (config.specialFields.includes("attack") && attack) {
        body += `Evolve for featured attack: ${attack}\n\n`;
    }

    const shinyText = shinyAvailable ? constants.shinyText : "";
    return `${title}\n` +
        `🎈 Join us at ${location} on ${formattedDate} for the ${title} ${body}` +
        `${shinyText}${constants.checkInText}`;
}

/**
 * Turn one bulk-table row into everything needed to render it, or an error
 * explaining why it can't be rendered. Network-derived values (live CP, shiny
 * status, artwork) are layered on by the caller.
 */
export function parseEventRow(event, now = new Date()) {
    const eventType = mapEventTypeFromName(event.name);
    if (!eventType) {
        return { ok: false, reason: `Could not identify event type for`, event };
    }
    const config = eventConfig[eventType];
    const pokemon = extractPokemonFromEvent(event.name);
    const dateStr = parseDateString(event.date, now);
    const formattedDate = dateStr ? formatDate(dateStr, now) : null;
    if (!formattedDate) {
        return { ok: false, reason: `Could not parse date for`, event, detail: event.date };
    }
    return {
        ok: true,
        eventType,
        pokemon,
        displayName: pokemon || event.name,
        formattedDate,
        shinyFromText: isShinyInDetails(event.details),
        bonuses: extractBonusesFromDetails(eventType, event.details),
        // Individual names for CP and artwork lookups; `pokemon` stays verbatim
        // for the title.
        pokemonNames: splitPokemonNames(pokemon),
        // CP is resolved by the caller (it needs the data layer); this only says
        // whether this event type shows a CP line at all.
        needsCP: !!pokemon && config.specialFields.includes("hundo"),
        needsShinyCheck: !!pokemon,
        attack: config.specialFields.includes("attack") ? extractAttackFromDetails(event.details) : ""
    };
}
