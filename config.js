/**
 * Event definitions and the wording of the generated description.
 *
 * This is the file to edit to adapt deGen to another community: `constants`
 * controls every fixed phrase in the output, and `eventConfig` controls which
 * event types exist, when they run, which bonuses they may carry, and which
 * extra fields they collect. No other file hardcodes description wording.
 */

export const constants = {
    checkInText: '✅ "Check in" on Campfire when you arrive',
    eventEmojis: "💃☀️🕺",
    shinyText: "If you're lucky, you might encounter a shiny one ✨\n",
    bonusHeaderSingle: "————Event Bonus————",
    bonusHeaderMultiple: "————Event Bonuses————",
    defaultLocation: "Sundance Park"
};

/**
 * specialFields drives both the form fields rendered and the lines that appear
 * in the description — "hundo"/"whundo" produce the CP line, "attack" produces
 * the featured-attack line. Nothing keys off the event *name*.
 */
export const eventConfig = {
    "Spotlight Hour": {
        time: "6-7PM",
        bonuses: ["2x Catch Stardust", "2x Catch XP", "2x Catch Candy", "2x Transfer Candy", "2x Evolution XP"],
        specialFields: [],
        maxBonuses: 2
    },
    "Raid Hour": {
        time: "6-7PM",
        bonuses: [],
        specialFields: ["hundo", "whundo"],
        maxBonuses: 0
    },
    "Community Day": {
        time: "2-5PM",
        bonuses: ["1/2 Hatch Distance", "1/4 Hatch Distance", "2x Catch XP & Stardust", "2x Catch Candy & XL Chance", "3x Catch Stardust", "3 HR Lures / Incense", "+1 Special Trade & Half Trade Cost"],
        specialFields: ["attack"],
        maxBonuses: 4
    },
    "Community Day Classic": {
        time: "2-5PM",
        bonuses: ["1/4 Hatch Distance", "3 HR Lures / Incense", "5 Photobomb Encounters", "Extra Special Trade"],
        specialFields: ["attack"],
        maxBonuses: 4
    },
    "Raid Day": {
        time: "2-5PM",
        bonuses: ["Increased shiny chance", "5 free raid passes by spinning gyms, 6 total", "Remote raids increased to 20", "Extra Raid Bonus", "1.5x XP from Raids"],
        specialFields: ["hundo", "whundo", "attack"],
        maxBonuses: 4
    },
    "Hatch Day": {
        time: "2-5PM",
        bonuses: ["Increased shiny chance", "1/4 Hatch Distance", "1/2 Hatch Distance"],
        specialFields: [],
        maxBonuses: 3
    },
    "Research Day": {
        time: "2-5PM",
        bonuses: ["Increased shiny chance"],
        specialFields: [],
        maxBonuses: 2
    },
    "Max Battles": {
        time: "2-5PM",
        bonuses: ["1/4 Adventure Distance for MP", "MP Collection raised to 1600", "8x MP from Power Spots", "2x MP for Exploring", "+2 Special Trades"],
        specialFields: ["hundo"],
        maxBonuses: 5
    }
};

/** Event-name fragments the bulk parser maps to a type. Longest match wins, so order matters. */
export const eventTypeAliases = [
    ["community day classic", "Community Day Classic"],
    ["community day", "Community Day"],
    ["hatch day", "Hatch Day"],
    ["raid day", "Raid Day"],
    ["raid hour", "Raid Hour"],
    ["spotlight hour", "Spotlight Hour"],
    ["research day", "Research Day"],
    ["max battle", "Max Battles"]
];

/**
 * Bonus detection for the bulk importer. A pattern may offer several spellings;
 * the first one the matched event type actually declares is the one used.
 */
export const bonusPatterns = [
    { re: /3[x×]\s*catch stardust|3[x×]\s*stardust/i, bonus: "3x Catch Stardust" },
    { re: /2[x×]\s*catch xp\s*[&]\s*stardust|2[x×]\s*xp\s*[&]\s*stardust/i, bonus: "2x Catch XP & Stardust" },
    { re: /2[x×]\s*catch xp|2[x×]\s*xp(?!\s*[&])/i, bonus: "2x Catch XP" },
    { re: /2[x×]\s*catch stardust|2[x×]\s*stardust/i, bonus: "2x Catch Stardust" },
    { re: /2[x×]\s*candy\s*[&]\s*xl|2[x×]\s*candy.*xl/i, bonus: "2x Catch Candy & XL Chance" },
    { re: /2[x×]\s*catch candy|2[x×]\s*candy(?!\s*[&xl])/i, bonus: "2x Catch Candy" },
    { re: /2[x×]\s*transfer candy/i, bonus: "2x Transfer Candy" },
    { re: /2[x×]\s*evolution xp|2[x×]\s*evolv/i, bonus: "2x Evolution XP" },
    { re: /[¼]|1\/4\s*hatch/i, bonus: "1/4 Hatch Distance" },
    { re: /[½]|1\/2\s*hatch/i, bonus: "1/2 Hatch Distance" },
    { re: /3\s*hr\s*lures?/i, bonus: "3 HR Lures / Incense" },
    { re: /boosted shiny|increased shiny/i, bonus: "Increased shiny chance" },
    { re: /5\s*photobomb/i, bonus: "5 Photobomb Encounters" },
    // Community Day calls this "+1 Special Trade & Half Trade Cost"; CD Classic
    // calls it "Extra Special Trade". Offer both spellings.
    { re: /extra special trade|special trade|half trade cost/i, bonus: ["Extra Special Trade", "+1 Special Trade & Half Trade Cost"] },
    { re: /free raid pass/i, bonus: "5 free raid passes by spinning gyms, 6 total" },
    { re: /remote raid/i, bonus: "Remote raids increased to 20" },
    { re: /1\.5[x×]\s*xp from raids/i, bonus: "1.5x XP from Raids" },
    { re: /extra raid bonus/i, bonus: "Extra Raid Bonus" },
    { re: /1\/4.*adventure|adventure.*1\/4/i, bonus: "1/4 Adventure Distance for MP" },
    { re: /mp.*1600|1600.*mp/i, bonus: "MP Collection raised to 1600" },
    { re: /8[x×].*mp|8[x×].*power spot/i, bonus: "8x MP from Power Spots" },
    { re: /2[x×].*mp.*explor/i, bonus: "2x MP for Exploring" }
];

/**
 * Combat Power multipliers for the two catch levels shown in raid descriptions.
 * L20 is a standard raid catch; L25 is the weather-boosted catch.
 */
export const CPM = {
    level20: 0.5974,
    level25: 0.667934
};
