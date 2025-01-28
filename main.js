document.addEventListener("DOMContentLoaded", () => {
    let selectedEventType = ""; // Keeps track of the selected event type
    const eventForm = document.getElementById("event-form");
    const dynamicInputs = document.getElementById("dynamic-inputs");
    const output = document.getElementById("output");

    // Event type buttons
    const eventTypes = {
        "Spotlight Hour": ["2x Catch Stardust", "2x Catch XP", "2x Catch Candy", "2x Transfer Candy", "2x Evolution XP"],
        "Raid Hour": [],
        "Community Day Classic": ["1/4 Hatch Distance", "3 HR Lures / Incense", "5 Photobomb Encounters", "Extra Special Trade"],
        "Community Day": ["1/2 Hatch Distance", "1/4 Hatch Distance", "2x Catch XP & Stardust", "2x Catch Candy & XL Chance", "3x Catch Stardust", "3 HR Lures / Incense", "+1 Special Trade & Half Trade Cost"],
        "Raid Day": ["Increased shiny chance", "5 free raid passes by spinning gyms, 7 total", "Remote raids increased to 20", "Extra Raid Bonus"],
        "Hatch Day": ["Increased shiny chance", "1/4 Hatch Distance", "1/2 Hatch Distance"],
        "Research Day": ["Increased shiny chance"]
    };

    Object.keys(eventTypes).forEach(event => {
        document.getElementById(`${event.toLowerCase().replace(/ /g, "-")}-btn`).addEventListener("click", () => setupForm(event));
    });

    document.getElementById("next-btn").addEventListener("click", addInputs);
    document.getElementById("generate-btn").addEventListener("click", generateDescriptions);

    // Function to set up the form
    function setupForm(type) {
        selectedEventType = type;
        eventForm.style.display = "block"; // Show the form
        dynamicInputs.innerHTML = ""; // Clear previous inputs
    }

    function addInputs() {
        const numDescriptionsInput = document.getElementById("num-descriptions");
        const numDescriptions = parseInt(numDescriptionsInput.value);

        if (isNaN(numDescriptions) || numDescriptions < 1) {
            alert("Please enter a valid number of descriptions.");
            return;
        }

        dynamicInputs.innerHTML = ""; // Clear previous inputs
        for (let i = 0; i < numDescriptions; i++) {
            dynamicInputs.innerHTML += `
                <div>
                    <h3>${selectedEventType} ${i + 1}</h3>
                    ${generateCommonFields(i)}
                    ${generateBonusFields(i, 4)}
                    ${generateSpecialFields(i)}
                </div>
            `;
        }
    }

    function generateCommonFields(index) {
        return `
            <label>Pokémon: <input type="text" id="pokemon-${index}" required></label>
            <br>
            <label>Shiny Available? 
                <select id="shiny-${index}">
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                </select>
            </label>
            <label>Date: <input type="date" id="date-${index}" required></label>
            <br>
        `;
    }

    function generateBonusFields(index, numBonuses) {
        const bonuses = eventTypes[selectedEventType];
        if (!bonuses.length) return ""; // No bonuses for this event

        let bonusFields = "";
        if (selectedEventType === "Spotlight Hour") {
            bonusFields += `
                <label>Bonus 1:
                    <select id="bonus-${index}">
                        <option value="None">None</option>
                        ${bonuses.map(bonus => `<option value="${bonus}">${bonus}</option>`).join("")}
                    </select>
                </label>
                <label>Bonus 2:
                    <select id="bonus2-${index}">
                        <option value="None">None</option>
                        ${bonuses.map(bonus => `<option value="${bonus}">${bonus}</option>`).join("")}
                    </select>
                </label>
                <br>
            `;
        } else {
            for (let j = 1; j <= numBonuses; j++) {
                bonusFields += `
                    <label>Bonus ${j}:
                        <select id="bonus${j}-${index}">
                            <option value="None">None</option>
                            ${bonuses.map(bonus => `<option value="${bonus}">${bonus}</option>`).join("")}
                        </select>
                    </label>
                `;
                if (j % 2 === 0) bonusFields += "<br>";
            }
        }
        return bonusFields;
    }

    function generateSpecialFields(index) {
        if (selectedEventType === "Raid Hour") {
            return `
                <label>Hundo: <input type="text" id="hundo-${index}" required></label>
                <label>Whundo: <input type="text" id="whundo-${index}" required></label>
            `;
        } else if (["Community Day", "Community Day Classic", "Raid Day"].includes(selectedEventType)) {
            return `<label>Featured Attack: <input type="text" id="attack-${index}" required></label>`;
        }
        return ""; // No special fields for other events
    }

    function generateDescriptions() {
        const numDescriptionsInput = document.getElementById("num-descriptions");
        const numDescriptions = parseInt(numDescriptionsInput.value);

        if (isNaN(numDescriptions) || numDescriptions < 1) {
            alert("Please enter a valid number of descriptions.");
            return;
        }

        output.innerHTML = "<h2>Generated Descriptions</h2>"; // Clear previous output
        for (let i = 0; i < numDescriptions; i++) {
            const pokemon = document.getElementById(`pokemon-${i}`)?.value;
            const dateInput = document.getElementById(`date-${i}`)?.value;

            if (!pokemon || !dateInput) {
                alert(`Missing required fields for description ${i + 1}. Please fill out all fields.`);
                return;
            }

            const formattedDate = formatDate(dateInput);
            const bonuses = collectBonuses(i, 4);
            const shinyAvailable = document.getElementById(`shiny-${i}`)?.value === "yes";
            const shinyText = shinyAvailable ? `If you're lucky, you might encounter a shiny one ✨ \n` : "";

            if (selectedEventType === "Spotlight Hour") {
                const bonus = document.getElementById(`bonus-${i}`)?.value || "None";
                const bonus2 = document.getElementById(`bonus2-${i}`)?.value || "None";
                const bonusText = (bonus !== "None" && bonus2 !== "None")
                    ? `${bonus} and ${bonus2}`
                    : bonus !== "None"
                        ? bonus
                        : bonus2 !== "None"
                            ? bonus2
                            : "None";

                output.innerHTML += `
                    <div class="description">
                        <textarea readonly>${pokemon} Spotlight Hour
🎈 Join us at Sundance Park on ${formattedDate} for the ${pokemon} Spotlight Hour from 6-7PM featuring ${bonusText} 💃☀️🕺

${shinyText}✅ "Check in" on Campfire when you arrive</textarea>
                        <button onclick="copyToClipboard(this)">Copy</button>
                        <span class="copy-feedback" style="display: none;">Copied!</span>
                    </div>
                `;
            }

            else if (selectedEventType === "Raid Hour") {
                const hundo = document.getElementById(`hundo-${i}`)?.value;
                const whundo = document.getElementById(`whundo-${i}`)?.value;

                output.innerHTML += `
                    <div class="description">
                        <textarea readonly>${pokemon} Raid Hour
🎈 Join us at Sundance Park on ${formattedDate} for the ${pokemon} Raid Hour from 6-7PM: 💃☀️🕺

💯 - ${hundo} / WB - ${whundo}

${shinyText}✅ "Check in" on Campfire when you arrive</textarea>
                        <button onclick="copyToClipboard(this)">Copy</button>
                        <span class="copy-feedback" style="display: none;">Copied!</span>
                    </div>
                `;
            }

            else if (["Community Day", "Community Day Classic", "Raid Day"].includes(selectedEventType)) {
                const attack = document.getElementById(`attack-${i}`)?.value;

                output.innerHTML += `
                    <div class="description">
                        <textarea readonly>${pokemon} ${selectedEventType}
🎈 Join us at Sundance Park on ${formattedDate} for the ${pokemon} ${selectedEventType} from 2-5PM featuring: 💃☀️🕺

${bonuses ? `${bonuses}\n\n` : ""}Evolve for featured attack: ${attack}\n
${shinyText}✅ "Check in" on Campfire when you arrive</textarea>
                        <button onclick="copyToClipboard(this)">Copy</button>
                        <span class="copy-feedback" style="display: none;">Copied!</span>
                    </div>
                `;
            }

            else if (selectedEventType === "Hatch Day") {
                output.innerHTML += `
                    <div class="description">
                        <textarea readonly>${pokemon} Hatch Day
🎈 Join us at Sundance Park on ${formattedDate} for the ${pokemon} Hatch Day from 2-5PM featuring: 💃☀️🕺

${bonuses ? `${bonuses}\n\n` : ""}${shinyText}✅ "Check in" on Campfire when you arrive</textarea>
                        <button onclick="copyToClipboard(this)">Copy</button>
                        <span class="copy-feedback" style="display: none;">Copied!</span>
                    </div>
                `;
            }

            else if (selectedEventType === "Research Day") {
                output.innerHTML += `
                    <div class="description">
                        <textarea readonly>${pokemon} Research Day
🎈 Join us at Sundance Park on ${formattedDate} for the ${pokemon} Research Day from 2-5PM featuring: 💃☀️🕺

${bonuses ? `${bonuses}\n\n` : ""}${shinyText}✅ "Check in" on Campfire when you arrive</textarea>
                        <button onclick="copyToClipboard(this)">Copy</button>
                        <span class="copy-feedback" style="display: none;">Copied!</span>
                    </div>
                `;
            }
        }
    }

    function collectBonuses(index, numBonuses) {
        const bonuses = [];
        for (let j = 1; j <= numBonuses; j++) {
            const bonus = document.getElementById(`bonus${j}-${index}`)?.value;
            if (bonus && bonus !== "None") bonuses.push(`- ${bonus}`);
        }
        return bonuses.join("\n");
    }

    // Corrected function to format date considering local time zone
    function formatDate(inputDate) {
        const date = new Date(inputDate + 'T00:00:00'); // Assuming the input date is local time
        const options = { month: "long", day: "numeric" };
        const day = date.getDate();
        const suffix = getDaySuffix(day);
        return date.toLocaleDateString("en-US", options).replace(day, `${day}${suffix}`);
    }

    function getDaySuffix(day) {
        if (day >= 11 && day <= 13) return "th";
        switch (day % 10) {
            case 1:
                return "st";
            case 2:
                return "nd";
            case 3:
                return "rd";
            default:
                return "th";
        }
    }

    window.copyToClipboard = function (button) {
        const textarea = button.previousElementSibling;
        const feedback = button.nextElementSibling;

        if (textarea) {
            textarea.select();
            textarea.setSelectionRange(0, textarea.value.length); // For mobile compatibility
            document.execCommand("copy");

            if (feedback) {
                feedback.style.display = "inline";
                setTimeout(() => {
                    feedback.style.display = "none";
                }, 2000);
            }
        }
    };
});