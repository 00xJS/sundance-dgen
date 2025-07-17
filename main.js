document.addEventListener("DOMContentLoaded", async () => {
    let selectedEventType = "";
    const eventForm = document.getElementById("event-form");
    const dynamicInputs = document.getElementById("dynamic-inputs");
    const output = document.getElementById("output");
    const numDescriptionsInput = document.getElementById("num-descriptions");
    let pokemonList = [];

    // Constants for customization
    const constants = {
        location: "Sundance Park",
        checkInText: '✅ "Check in" on Campfire when you arrive',
        eventEmojis: "💃☀️🕺",
        shinyText: "If you're lucky, you might encounter a shiny one ✨\n",
        bonusHeaderSingle: "————Event Bonus————",
        bonusHeaderMultiple: "————Event Bonuses————"
    };

    // Event configuration
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
            bonuses: ["Increased shiny chance", "5 free raid passes by spinning gyms, 6 total", "Remote raids increased to 20", "Extra Raid Bonus"],
            specialFields: ["attack"],
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
        });
    });

    // Auto-generate inputs on number change
    numDescriptionsInput.addEventListener("input", debounce(() => {
        const num = parseInt(numDescriptionsInput.value);
        if (num > 0) {
            addInputs(num);
        } else {
            dynamicInputs.innerHTML = "";
        }
    }, 300));

    // Generate descriptions
    document.getElementById("generate-btn").addEventListener("click", debounce(generateDescriptions, 300));

    // Reset form
    document.getElementById("reset-btn").addEventListener("click", () => {
        eventForm.reset();
        dynamicInputs.innerHTML = "";
        output.innerHTML = "<h2>Generated Descriptions</h2>";
        eventForm.style.display = "none";
        selectedEventType = "";
    });

    // Debounce utility
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
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
            div.addEventListener("click", () => {
                input.value = suggestion;
                suggestionBox.innerHTML = "";
                suggestionBox.style.display = "none";
                input.style.borderColor = "";
            });
            suggestionBox.appendChild(div);
        });
        suggestionBox.style.display = "block";
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

        // Add real-time validation and autocomplete for required fields
        dynamicInputs.querySelectorAll("input[required], select[required]").forEach(input => {
            input.addEventListener("input", () => {
                input.style.borderColor = input.value ? "" : "var(--error-red)";
                if (input.id.startsWith("pokemon-")) {
                    const index = input.id.split("-")[1];
                    const value = input.value.toLowerCase();
                    const suggestions = pokemonList
                        .filter(p => p.toLowerCase().startsWith(value))
                        .slice(0, 5); // Limit to 5 suggestions
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

    // Generate descriptions
    async function generateDescriptions() {
        const num = parseInt(numDescriptionsInput.value);
        if (isNaN(num) || num < 1) {
            alert("Please enter a valid number of descriptions.");
            return;
        }

        const descriptions = ["<h2>Generated Descriptions</h2>"];
        const config = eventConfig[selectedEventType];

        for (let i = 0; i < num; i++) {
            const pokemon = document.getElementById(`pokemon-${i}`)?.value?.trim();
            const dateInput = document.getElementById(`date-${i}`)?.value;
            const shinyAvailable = document.getElementById(`shiny-${i}`)?.value === "yes";

            // Validate required fields
            if (!pokemon || !dateInput) {
                alert(`Missing required fields for description ${i + 1}.`);
                return;
            }

            const formattedDate = formatDate(dateInput);
            if (!formattedDate) {
                alert(`Invalid date for description ${i + 1}. Please select a valid date.`);
                return;
            }

            // Fetch Pokémon image
            const imageUrl = await fetchPokemonImage(pokemon);
            const imageTag = imageUrl ? `<img src="${imageUrl}" alt="${pokemon} image" class="pokemon-image">` : "<p>No image available</p>";

            const shinyText = shinyAvailable ? constants.shinyText : "";
            let eventText = `from ${config.time} ${constants.eventEmojis}\n\n`;

            // Handle bonuses
            if (config.bonuses.length) {
                const bonuses = collectBonuses(i, config.maxBonuses);
                const bonusCount = bonuses.split("\n").length;
                const bonusHeader = bonusCount > 1 ? constants.bonusHeaderMultiple : bonusCount === 1 ? constants.bonusHeaderSingle : "";
                if (bonuses) eventText += `${bonusHeader}\n${bonuses}\n\n`;
            }

            // Handle special fields (always include, even if empty)
            if (selectedEventType === "Raid Hour") {
                const hundo = document.getElementById(`hundo-${i}`)?.value?.trim() || "";
                const whundo = document.getElementById(`whundo-${i}`)?.value?.trim() || "";
                eventText += `💯 - ${hundo} / WB - ${whundo}\n\n`;
            } else if (selectedEventType === "Max Battles") {
                const hundo = document.getElementById(`hundo-${i}`)?.value?.trim() || "";
                eventText += `💯 - ${hundo}\n\n`;
            } else if (config.specialFields.includes("attack")) {
                const attack = document.getElementById(`attack-${i}`)?.value?.trim() || "";
                eventText += `Evolve for featured attack: ${attack}\n\n`;
            }

            descriptions.push(`
                <div class="description">
                    ${imageTag}
                    <textarea readonly>${pokemon} ${selectedEventType}
🎈 Join us at ${constants.location} on ${formattedDate} for the ${pokemon} ${selectedEventType} ${eventText}${shinyText}${constants.checkInText}</textarea>
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