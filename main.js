import { pokemonCPData, autoFillCP } from './pokemonCPData.js';

document.addEventListener("DOMContentLoaded", async () => {
    let selectedEventType = "";
    const eventForm = document.getElementById("event-form");
    const dynamicInputs = document.getElementById("dynamic-inputs");
    const output = document.getElementById("output");
    const numDescriptionsInput = document.getElementById("num-descriptions");
    const customLocationInput = document.getElementById("custom-location");
    let pokemonList = [];
    let goStatsCache = null;
    let shinyCache = null;

    // Constants for customization (location now dynamic, so remove from here)
    const constants = {
        checkInText: '✅ "Check in" on Campfire when you arrive',
        eventEmojis: "💃☀️🕺",
        shinyText: "If you're lucky, you might encounter a shiny one ✨\n",
        bonusHeaderSingle: "————Event Bonus————",
        bonusHeaderMultiple: "————Event Bonuses————"
    };

    // Event configuration (unchanged)
    const eventConfig = {
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

    // Fetch Pokémon names for autocomplete
    async function fetchPokemonList() {
        try {
            const response = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000");
            if (!response.ok) throw new Error("Failed to fetch Pokémon list");
            const data = await response.json();
            pokemonList = data.results.map(p => p.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));
        } catch (error) {
            console.error("Error fetching Pokémon list:", error);
            pokemonList = Object.keys(pokemonCPData); // Fallback to pokemonCPData keys
        }
    }

    // Initialize Pokémon list
    await fetchPokemonList();

    // Setup event type buttons
    Object.keys(eventConfig).forEach(event => {
        document.getElementById(`${event.toLowerCase().replace(/ /g, "-")}-btn`).addEventListener("click", () => {
            selectedEventType = event;
            eventForm.style.display = "block";
            numDescriptionsInput.value = "1";
            dynamicInputs.innerHTML = "";
            addInputs(1);
            output.innerHTML = "<h2>Generated Descriptions</h2>";
            // Reset location to default
            document.querySelector('input[name="location-type"][value="sundance"]').checked = true;
            customLocationInput.style.visibility = "hidden";
            customLocationInput.value = "";
            customLocationInput.required = false;
        });
    });

    // Handle location radio change
    document.querySelectorAll('input[name="location-type"]').forEach(radio => {
        radio.addEventListener("change", () => {
            if (radio.value === "custom") {
                customLocationInput.style.visibility = "visible";
                customLocationInput.required = true;
            } else {
                customLocationInput.style.visibility = "hidden";
                customLocationInput.required = false;
                customLocationInput.value = "";
            }
        });
    });

    // Auto-generate inputs on number change
    numDescriptionsInput.addEventListener("input", debounce(() => {
        let num = parseInt(numDescriptionsInput.value);
        if (num > 20) { num = 20; numDescriptionsInput.value = 20; }
        if (num > 0) {
            addInputs(num);
        } else {
            dynamicInputs.innerHTML = "";
        }
    }, 300));

    // Generate descriptions
    document.getElementById("generate-btn").addEventListener("click", debounce(generateDescriptions, 300));

    // Bulk import handler
    document.getElementById("bulk-generate-btn").addEventListener("click", debounce(generateBulkDescriptions, 300));

    // Handle bulk location radio change
    document.querySelectorAll('input[name="bulk-location-type"]').forEach(radio => {
        radio.addEventListener("change", () => {
            const bulkCustom = document.getElementById("bulk-custom-location");
            if (radio.value === "custom") {
                bulkCustom.style.visibility = "visible";
            } else {
                bulkCustom.style.visibility = "hidden";
                bulkCustom.value = "";
            }
        });
    });

    // Reset form
    document.getElementById("reset-btn").addEventListener("click", () => {
        eventForm.reset();
        dynamicInputs.innerHTML = "";
        output.innerHTML = "<h2>Generated Descriptions</h2>";
        eventForm.style.display = "none";
        selectedEventType = "";
        customLocationInput.style.visibility = "hidden";
        customLocationInput.required = false;
    });

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Fetch Pokemon GO base stats and calculate raid catch CP
    async function fetchPokemonGOCP(pokemonName) {
        try {
            if (!goStatsCache) {
                const resp = await fetch('https://pogoapi.net/api/v1/pokemon_stats.json');
                if (!resp.ok) throw new Error('GO stats unavailable');
                goStatsCache = await resp.json();
            }
            const entry = goStatsCache.find(p =>
                p.pokemon_name.toLowerCase() === pokemonName.toLowerCase()
            );
            if (!entry) return null;
            const { base_attack, base_defense, base_stamina } = entry;
            const calc = cpm => Math.floor(
                (base_attack + 15) * Math.sqrt(base_defense + 15) * Math.sqrt(base_stamina + 15) * cpm * cpm / 10
            );
            return { hundo: calc(0.5974), whundo: calc(0.667934) };
        } catch {
            return null;
        }
    }

    // Fetch shiny release data and build a lookup Set (cached)
    async function fetchShinyReleased() {
        if (shinyCache) return shinyCache;
        const resp = await fetch('https://pogoapi.net/api/v1/shiny_pokemon.json');
        if (!resp.ok) throw new Error('Shiny data unavailable');
        const data = await resp.json();
        shinyCache = new Set(Object.values(data).map(p => p.name.toLowerCase()));
        return shinyCache;
    }

    // Returns true/false if known, null if API failed (caller falls back to text detection)
    async function isPokemonShinyReleased(pokemonName) {
        try {
            const shinySet = await fetchShinyReleased();
            return shinySet.has(pokemonName.toLowerCase());
        } catch {
            return null;
        }
    }

    // Auto-set shiny dropdown on manual form after Pokemon selection
    async function tryAPIFillShiny(index) {
        const shinySelect = document.getElementById(`shiny-${index}`);
        if (!shinySelect) return;
        const pokemon = document.getElementById(`pokemon-${index}`)?.value?.trim();
        if (!pokemon) return;
        const released = await isPokemonShinyReleased(pokemon);
        if (released !== null) shinySelect.value = released ? 'yes' : 'no';
    }

    // API fallback CP fill for manual form (fires after autoFillCP if fields still empty)
    async function tryAPIFillCP(index) {
        if (selectedEventType !== 'Raid Hour' && selectedEventType !== 'Raid Day') return;
        const hundoInput = document.getElementById(`hundo-${index}`);
        if (!hundoInput || hundoInput.value) return;
        const pokemon = document.getElementById(`pokemon-${index}`)?.value?.trim();
        if (!pokemon) return;
        const cp = await fetchPokemonGOCP(pokemon);
        if (cp) {
            hundoInput.value = cp.hundo;
            const whundoInput = document.getElementById(`whundo-${index}`);
            if (whundoInput) whundoInput.value = cp.whundo;
        }
    }

    // Fetch Pokémon image URL
    async function fetchPokemonImage(pokemonName) {
        try {
            const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase().replace(/ /g, "-")}`);
            if (!response.ok) {
                throw new Error("Pokémon not found");
            }
            const data = await response.json();
            const pokedexNumber = String(data.id).padStart(3, "0");
            return `https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/${pokedexNumber}.png`;
        } catch (error) {
            console.error(`Failed to fetch image for ${pokemonName}:`, error);
            return null;
        }
    }

    // Show autocomplete suggestions
    function showSuggestions(input, suggestions, index) {
        let suggestionBox = document.getElementById(`suggestions-${index}`);
        if (!suggestionBox) {
            suggestionBox = document.createElement("div");
            suggestionBox.id = `suggestions-${index}`;
            suggestionBox.className = "suggestions";
            input.parentNode.appendChild(suggestionBox);
        }
        suggestionBox.innerHTML = "";
        if (suggestions.length === 0) {
            suggestionBox.style.display = "none";
            return;
        }

        suggestions.forEach(suggestion => {
            const div = document.createElement("div");
            div.textContent = suggestion;
            div.addEventListener("click", async () => {
                input.value = suggestion;
                suggestionBox.innerHTML = "";
                suggestionBox.style.display = "none";
                input.style.borderColor = "";
                autoFillCP(index);
                await Promise.all([tryAPIFillCP(index), tryAPIFillShiny(index)]);
            });
            suggestionBox.appendChild(div);
        });
        suggestionBox.style.display = "block";
    }

    // Handle Pokémon input for autocomplete and autofill
    const debouncedAutoFillCP = debounce(autoFillCP, 300);
    function handlePokemonInput(index) {
        const input = document.getElementById(`pokemon-${index}`);
        const value = input.value.toLowerCase();
        const suggestions = pokemonList
            .filter(p => p.toLowerCase().startsWith(value))
            .slice(0, 5); // Limit to 5 suggestions
        showSuggestions(input, suggestions, index);
        debouncedAutoFillCP(index); // Trigger autofill with debounce
    }

    // Generate form fields
    function addInputs(num) {
        dynamicInputs.innerHTML = "";
        const today = new Date().toISOString().split("T")[0]; // Today's date in YYYY-MM-DD
        for (let i = 0; i < num; i++) {
            const config = eventConfig[selectedEventType];
            let fields = `
                <div class="dynamic-section">
                    <h3>${selectedEventType} ${i + 1}</h3>
                    <label>Pokémon: <input type="text" id="pokemon-${i}" required></label>
                    <label>Shiny Available? 
                        <select id="shiny-${i}" required>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                        </select>
                    </label>
                    <label>Date: <input type="date" id="date-${i}" value="${today}" required></label>
            `;

            // Add bonus fields
            if (config.bonuses.length) {
                for (let j = 1; j <= config.maxBonuses; j++) {
                    fields += `
                        <label>Bonus ${j}:
                            <select id="bonus${j}-${i}">
                                <option value="None">None</option>
                                ${config.bonuses.map(b => `<option value="${b}">${b}</option>`).join("")}
                            </select>
                        </label>
                    `;
                }
            }

            // Add special fields (not required)
            config.specialFields.forEach(field => {
                fields += `<label>${field.replace(/^\w/, c => c.toUpperCase())}: <input type="text" id="${field}-${i}"></label>`;
            });

            fields += "</div>";
            dynamicInputs.innerHTML += fields;
        }

        // Add input listeners for Pokémon fields (replaces inline oninput)
        dynamicInputs.querySelectorAll('input[id^="pokemon-"]').forEach(input => {
            const index = parseInt(input.id.split('-')[1]);
            input.addEventListener('input', () => handlePokemonInput(index));
        });

        // Add real-time validation for required fields
        dynamicInputs.querySelectorAll("input[required], select[required]").forEach(input => {
            input.addEventListener("input", () => {
                input.style.borderColor = input.value ? "" : "var(--error-red)";
                if (input.id.startsWith("pokemon-")) {
                    const index = parseInt(input.id.split("-")[1]);
                    const value = input.value.toLowerCase();
                    const suggestions = pokemonList
                        .filter(p => p.toLowerCase().startsWith(value))
                        .slice(0, 5);
                    showSuggestions(input, suggestions, index);
                }
            });

            // Hide suggestions on blur
            input.addEventListener("blur", () => {
                const suggestionBox = document.getElementById(`suggestions-${input.id.split("-")[1]}`);
                if (suggestionBox) {
                    setTimeout(() => suggestionBox.style.display = "none", 200);
                }
            });
        });
    }

    // Generate descriptions (now with dynamic location)
    async function generateDescriptions() {
        const num = parseInt(numDescriptionsInput.value);
        if (isNaN(num) || num < 1) {
            alert("Please enter a valid number of descriptions.");
            return;
        }

        // Get dynamic location
        const locationType = document.querySelector('input[name="location-type"]:checked')?.value;
        let location = "Sundance Park";
        if (locationType === "custom") {
            location = customLocationInput.value.trim();
            if (!location) {
                alert("Please enter a custom location.");
                return;
            }
        }

        const config = eventConfig[selectedEventType];

        // Collect and validate all form data first
        const items = [];
        for (let i = 0; i < num; i++) {
            const pokemon = document.getElementById(`pokemon-${i}`)?.value?.trim();
            const dateInput = document.getElementById(`date-${i}`)?.value;
            const shinyAvailable = document.getElementById(`shiny-${i}`)?.value === "yes";

            if (!pokemon || !dateInput) {
                alert(`Missing required fields for description ${i + 1}.`);
                return;
            }

            const formattedDate = formatDate(dateInput);
            if (!formattedDate) {
                alert(`Invalid or past date for description ${i + 1}.`);
                return;
            }

            items.push({
                pokemon,
                formattedDate,
                shinyAvailable,
                bonuses: config.bonuses.length ? collectBonuses(i, config.maxBonuses) : "",
                hundo: document.getElementById(`hundo-${i}`)?.value?.trim() || "",
                whundo: document.getElementById(`whundo-${i}`)?.value?.trim() || "",
                attack: document.getElementById(`attack-${i}`)?.value?.trim() || ""
            });
        }

        // Fetch all images in parallel
        const imageUrls = await Promise.all(items.map(({ pokemon }) => fetchPokemonImage(pokemon)));

        const descriptions = ["<h2>Generated Descriptions</h2>"];
        for (let i = 0; i < items.length; i++) {
            const { pokemon, formattedDate, shinyAvailable, bonuses, hundo, whundo, attack } = items[i];
            const imageUrl = imageUrls[i];
            const imageTag = imageUrl ? `<img src="${imageUrl}" alt="${pokemon} image" class="pokemon-image">` : "<p>No image available</p>";

            const shinyText = shinyAvailable ? constants.shinyText : "";
            let eventText = `from ${config.time} ${constants.eventEmojis}\n\n`;

            if (bonuses) {
                const bonusHeader = bonuses.split("\n").length > 1 ? constants.bonusHeaderMultiple : constants.bonusHeaderSingle;
                eventText += `${bonusHeader}\n${bonuses}\n\n`;
            }

            if (selectedEventType === "Raid Hour" || selectedEventType === "Raid Day") {
                eventText += `💯 - ${hundo} / WB - ${whundo}\n\n`;
            }
            if (selectedEventType === "Max Battles") {
                eventText += `💯 - ${hundo}\n\n`;
            }
            if (config.specialFields.includes("attack") && attack) {
                eventText += `Evolve for featured attack: ${attack}\n\n`;
            }

            descriptions.push(`
                <div class="description">
                    ${imageTag}
                    <textarea readonly>${pokemon} ${selectedEventType}
🎈 Join us at ${location} on ${formattedDate} for the ${pokemon} ${selectedEventType} ${eventText}${shinyText}${constants.checkInText}</textarea>
                    <button onclick="copyToClipboard(this)">Copy</button>
                    <span class="copy-feedback">Copied!</span>
                </div>
            `);
        }

        output.innerHTML = descriptions.join("");
    }

    // Collect bonuses
    function collectBonuses(index, numBonuses) {
        const bonuses = [];
        for (let j = 1; j <= numBonuses; j++) {
            const bonus = document.getElementById(`bonus${j}-${index}`)?.value;
            if (bonus && bonus !== "None") bonuses.push(`- ${bonus}`);
        }
        return bonuses.join("\n");
    }

    // Format date
    function formatDate(inputDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const date = new Date(inputDate + 'T00:00:00');
        if (date < today) return null;
        const options = { month: "long", day: "numeric" };
        const day = date.getDate();
        const suffix = getDaySuffix(day);
        return date.toLocaleDateString("en-US", options).replace(day, `${day}${suffix}`);
    }

    // Get day suffix
    function getDaySuffix(day) {
        if (day >= 11 && day <= 13) return "th";
        switch (day % 10) {
            case 1: return "st";
            case 2: return "nd";
            case 3: return "rd";
            default: return "th";
        }
    }

    // ---- Bulk Import Helpers ----

    function parseBulkTable(text) {
        const events = [];
        for (const line of text.trim().split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('|')) continue;
            if (/^\|[-\s|:]+\|$/.test(trimmed)) continue; // separator row
            const cols = trimmed.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
            if (cols.length < 3) continue;
            if (/event name/i.test(cols[0])) continue; // header row
            const [rawName, details, date] = cols;
            const name = rawName.replace(/\*\*/g, '').replace(/^[^\w]+/, '').trim();
            if (name && details && date) events.push({ name, details, date });
        }
        return events;
    }

    function mapEventTypeFromName(name) {
        const n = name.toLowerCase();
        if (n.includes('community day classic')) return 'Community Day Classic';
        if (n.includes('community day')) return 'Community Day';
        if (n.includes('hatch day')) return 'Hatch Day';
        if (n.includes('raid day')) return 'Raid Day';
        if (n.includes('raid hour')) return 'Raid Hour';
        if (n.includes('spotlight hour')) return 'Spotlight Hour';
        if (n.includes('research day')) return 'Research Day';
        if (n.includes('max battle')) return 'Max Battles';
        return null;
    }

    function extractPokemonFromEvent(name) {
        const dashMatch = name.match(/[–—-]\s*(.+)$/);
        if (dashMatch) return dashMatch[1].trim();
        const typePatterns = [
            'Community Day Classic', 'Community Day', 'Hatch Day',
            'Raid Day', 'Raid Hour', 'Spotlight Hour', 'Research Day', 'Max Battle Day', 'Max Battles'
        ];
        for (const pattern of typePatterns) {
            const idx = name.toLowerCase().indexOf(pattern.toLowerCase());
            if (idx > 0) {
                return name.substring(0, idx).replace(/^Replay:\s*/i, '').trim();
            }
        }
        return '';
    }

    function parseDateString(dateStr) {
        const monthMap = {
            jan:1, january:1, feb:2, february:2, mar:3, march:3,
            apr:4, april:4, may:5, jun:6, june:6, jul:7, july:7,
            aug:8, august:8, sep:9, september:9, oct:10, october:10,
            nov:11, november:11, dec:12, december:12
        };
        const match = dateStr.match(/([A-Za-z]+)\s+(\d+)/);
        if (!match) return null;
        const month = monthMap[match[1].toLowerCase()];
        const day = parseInt(match[2]);
        if (!month || !day) return null;
        const now = new Date();
        let year = now.getFullYear();
        if (month < now.getMonth() + 1) year++;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function extractBonusesFromDetails(eventType, details) {
        const config = eventConfig[eventType];
        if (!config || !config.bonuses.length) return [];
        const found = [];
        const patterns = [
            { re: /3[x×]\s*stardust/i,                                        bonus: '3x Catch Stardust' },
            { re: /2[x×]\s*catch xp\s*[&]\s*stardust|2[x×]\s*xp\s*[&]\s*stardust/i, bonus: '2x Catch XP & Stardust' },
            { re: /2[x×]\s*catch xp|2[x×]\s*xp(?!\s*[&])/i,                  bonus: '2x Catch XP' },
            { re: /2[x×]\s*catch stardust|2[x×]\s*stardust/i,                 bonus: '2x Catch Stardust' },
            { re: /2[x×]\s*candy\s*[&]\s*xl|2[x×]\s*candy.*xl/i,             bonus: '2x Catch Candy & XL Chance' },
            { re: /2[x×]\s*catch candy|2[x×]\s*candy(?!\s*[&xl])/i,          bonus: '2x Catch Candy' },
            { re: /2[x×]\s*transfer candy/i,                                   bonus: '2x Transfer Candy' },
            { re: /2[x×]\s*evolution xp|2[x×]\s*evolv/i,                     bonus: '2x Evolution XP' },
            { re: /[¼]|1\/4\s*hatch/i,                                        bonus: '1/4 Hatch Distance' },
            { re: /[½]|1\/2\s*hatch/i,                                        bonus: '1/2 Hatch Distance' },
            { re: /3\s*hr\s*lures?/i,                                         bonus: '3 HR Lures / Incense' },
            { re: /boosted shiny|increased shiny/i,                           bonus: 'Increased shiny chance' },
            { re: /5\s*photobomb/i,                                           bonus: '5 Photobomb Encounters' },
            { re: /extra special trade|special trade/i,                       bonus: 'Extra Special Trade' },
            { re: /free raid pass/i,                                          bonus: '5 free raid passes by spinning gyms, 6 total' },
            { re: /remote raid/i,                                             bonus: 'Remote raids increased to 20' },
            { re: /1\.5[x×]\s*xp from raids/i,                               bonus: '1.5x XP from Raids' },
            { re: /extra raid bonus/i,                                        bonus: 'Extra Raid Bonus' },
            { re: /1\/4.*adventure|adventure.*1\/4/i,                         bonus: '1/4 Adventure Distance for MP' },
            { re: /mp.*1600|1600.*mp/i,                                       bonus: 'MP Collection raised to 1600' },
            { re: /8[x×].*mp|8[x×].*power spot/i,                            bonus: '8x MP from Power Spots' },
            { re: /2[x×].*mp.*explor/i,                                       bonus: '2x MP for Exploring' },
        ];
        for (const { re, bonus } of patterns) {
            if (re.test(details) && config.bonuses.includes(bonus) && !found.includes(bonus)) {
                found.push(bonus);
                if (found.length >= config.maxBonuses) break;
            }
        }
        return found;
    }

    function extractAttackFromDetails(details) {
        const match = details.match(/(?:gets|learns)\s+([A-Z][A-Za-z\s]+?)(?:[,.]|$)/);
        return match ? match[1].trim() : '';
    }

    function isShinyInDetails(details) {
        return /shiny/i.test(details);
    }

    function lookupCP(pokemonName) {
        const key = Object.keys(pokemonCPData).find(k => k.toLowerCase() === pokemonName.toLowerCase());
        return key ? pokemonCPData[key] : null;
    }

    async function generateBulkDescriptions() {
        const input = document.getElementById("bulk-input").value.trim();
        if (!input) {
            alert("Please paste an event list.");
            return;
        }
        const events = parseBulkTable(input);
        if (!events.length) {
            alert("No events found. Make sure the input is a markdown table.");
            return;
        }

        const bulkLocationType = document.querySelector('input[name="bulk-location-type"]:checked')?.value;
        let location = "Sundance Park";
        if (bulkLocationType === "custom") {
            location = document.getElementById("bulk-custom-location").value.trim();
            if (!location) {
                alert("Please enter a custom location.");
                return;
            }
        }

        // Parse all events synchronously, collect warnings for unparseable rows
        const parsed = [];
        const warnings = [];
        for (const event of events) {
            const eventType = mapEventTypeFromName(event.name);
            if (!eventType) {
                warnings.push(`<p style="color:var(--hover-orange)">⚠️ Could not identify event type for: <strong>${event.name}</strong></p>`);
                continue;
            }
            const config = eventConfig[eventType];
            const pokemon = extractPokemonFromEvent(event.name);
            const dateStr = parseDateString(event.date);
            const formattedDate = dateStr ? formatDate(dateStr) : null;
            if (!formattedDate) {
                warnings.push(`<p style="color:var(--hover-orange)">⚠️ Could not parse date for: <strong>${event.name}</strong> (${event.date})</p>`);
                continue;
            }
            const localCP = pokemon ? lookupCP(pokemon) : null;
            parsed.push({
                eventType, config, pokemon, formattedDate,
                originalName: event.name,
                shinyAvailable: isShinyInDetails(event.details),
                bonuses: extractBonusesFromDetails(eventType, event.details),
                localCP,
                needsAPICP: !localCP && pokemon && (eventType === 'Raid Hour' || eventType === 'Raid Day'),
                attack: config.specialFields.includes('attack') ? extractAttackFromDetails(event.details) : ''
            });
        }

        // Fetch all images, missing CPs, and shiny status in parallel
        const [imageUrls, apiCPs, shinyResults] = await Promise.all([
            Promise.all(parsed.map(p => p.pokemon ? fetchPokemonImage(p.pokemon) : Promise.resolve(null))),
            Promise.all(parsed.map(p => p.needsAPICP ? fetchPokemonGOCP(p.pokemon) : Promise.resolve(null))),
            Promise.all(parsed.map(p => p.pokemon ? isPokemonShinyReleased(p.pokemon) : Promise.resolve(null)))
        ]);

        const descriptions = ["<h2>Generated Descriptions</h2>", ...warnings];
        for (let i = 0; i < parsed.length; i++) {
            const { eventType, config, pokemon, formattedDate, originalName, bonuses, localCP, attack } = parsed[i];
            // API shiny check takes priority; fall back to text detection if API failed (null)
            const shinyAvailable = shinyResults[i] !== null ? shinyResults[i] : parsed[i].shinyAvailable;
            const cpData = localCP || apiCPs[i];
            const hundo = cpData?.hundo ?? '';
            const whundo = cpData?.whundo ?? '';

            const imageUrl = imageUrls[i];
            const imageTag = imageUrl
                ? `<img src="${imageUrl}" alt="${pokemon} image" class="pokemon-image">`
                : "<p>No image available</p>";

            const shinyText = shinyAvailable ? constants.shinyText : '';
            const displayName = pokemon || originalName;
            let eventText = `from ${config.time} ${constants.eventEmojis}\n\n`;

            if (bonuses.length) {
                const bonusHeader = bonuses.length > 1 ? constants.bonusHeaderMultiple : constants.bonusHeaderSingle;
                eventText += `${bonusHeader}\n${bonuses.map(b => `- ${b}`).join('\n')}\n\n`;
            }
            if (eventType === 'Raid Hour' || eventType === 'Raid Day') {
                eventText += `💯 - ${hundo} / WB - ${whundo}\n\n`;
            }
            if (eventType === 'Max Battles') {
                eventText += `💯 - ${hundo}\n\n`;
            }
            if (attack) {
                eventText += `Evolve for featured attack: ${attack}\n\n`;
            }

            descriptions.push(`
                <div class="description">
                    ${imageTag}
                    <textarea readonly>${displayName} ${eventType}
🎈 Join us at ${location} on ${formattedDate} for the ${displayName} ${eventType} ${eventText}${shinyText}${constants.checkInText}</textarea>
                    <button onclick="copyToClipboard(this)">Copy</button>
                    <span class="copy-feedback">Copied!</span>
                </div>
            `);
        }

        output.innerHTML = descriptions.join('');
        output.scrollIntoView({ behavior: 'smooth' });
    }

    // Copy to clipboard
    window.copyToClipboard = async function (button) {
        const textarea = button.previousElementSibling;
        const feedback = button.nextElementSibling;

        if (textarea) {
            try {
                await navigator.clipboard.writeText(textarea.value);
                feedback.textContent = "Copied!";
                feedback.style.color = "green";
                feedback.style.display = "inline";
                feedback.addEventListener("click", () => feedback.style.display = "none", { once: true });
                setTimeout(() => feedback.style.display = "none", 5000);
            } catch (err) {
                feedback.textContent = "Copy failed!";
                feedback.style.color = "var(--error-red)";
                feedback.style.display = "inline";
                feedback.addEventListener("click", () => feedback.style.display = "none", { once: true });
                setTimeout(() => feedback.style.display = "none", 5000);
                console.error("Failed to copy:", err);
            }
        }
    };
});