/**
 * DOM wiring. All parsing, formatting and description text lives in parse.js;
 * everything that touches the network lives in data.js.
 */

import { eventConfig } from './config.js';
import { parseBulkTable, parseEventRow, formatDate, renderDescription } from './parse.js';
import {
    primeData, getCatchCP, isShinyReleased, loadPokemonNames, fetchPokemonImage, onStatusChange
} from './data.js';

const STORAGE_KEY = 'sundance-dgen:v1';
const MAX_DESCRIPTIONS = 20;
const MAX_SUGGESTIONS = 5;

document.addEventListener('DOMContentLoaded', () => {
    const eventForm = document.getElementById('event-form');
    const dynamicInputs = document.getElementById('dynamic-inputs');
    const output = document.getElementById('output');
    const numDescriptionsInput = document.getElementById('num-descriptions');
    const customLocationInput = document.getElementById('custom-location');
    const bulkInput = document.getElementById('bulk-input');
    const bulkCustomLocation = document.getElementById('bulk-custom-location');
    const formMessages = document.getElementById('form-messages');
    const bulkMessages = document.getElementById('bulk-messages');

    let selectedEventType = '';
    let pokemonList = [];

    // ------------------------------------------------------------ helpers ----

    const escapeHTML = value => String(value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    function debounce(fn, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    /** An inline message. `body` is trusted HTML — escape anything interpolated into it. */
    const notice = (tag, body, variant = 'warn') =>
        `<div class="notice${variant === 'error' ? ' notice--error' : ''}">` +
        `<span class="tag">${escapeHTML(tag)}</span><span>${body}</span></div>`;

    function showMessages(container, html) {
        container.innerHTML = html;
        container.hidden = !html;
    }

    const clearMessages = container => showMessages(container, '');

    // -------------------------------------------------------- persistence ----

    function readStore() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
        } catch {
            return {};
        }
    }

    /** Persistence is a convenience — private mode or a full quota must not break the app. */
    function persist(patch) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStore(), ...patch }));
        } catch { /* ignore */ }
    }

    function restore() {
        const saved = readStore();
        if (typeof saved.bulkInput === 'string') bulkInput.value = saved.bulkInput;
        if (typeof saved.bulkCustomLocation === 'string') bulkCustomLocation.value = saved.bulkCustomLocation;
        if (typeof saved.customLocation === 'string') customLocationInput.value = saved.customLocation;

        for (const [group, value] of [['bulk-location-type', saved.bulkLocationType], ['location-type', saved.locationType]]) {
            if (!value) continue;
            const radio = document.querySelector(`input[name="${group}"][value="${value}"]`);
            if (radio) radio.checked = true;
        }
        syncLocationVisibility('bulk-location-type', bulkCustomLocation);
        syncLocationVisibility('location-type', customLocationInput);
    }

    /** Show the free-text location box only when "Custom" is selected. */
    function syncLocationVisibility(group, input) {
        const isCustom = document.querySelector(`input[name="${group}"]:checked`)?.value === 'custom';
        input.style.visibility = isCustom ? 'visible' : 'hidden';
        if (group === 'location-type') input.required = isCustom;
        if (!isCustom) input.value = '';
    }

    function chosenLocation(group, input) {
        const isCustom = document.querySelector(`input[name="${group}"]:checked`)?.value === 'custom';
        return isCustom ? input.value.trim() : null;   // null means "use the default"
    }

    // ------------------------------------------------------- status chip ----

    onStatusChange(({ source, generated }) => {
        const chip = document.getElementById('data-status');
        const label = document.getElementById('data-status-text');
        if (!chip || !label) return;

        chip.classList.remove('ok', 'warn', 'down');
        if (source === 'snapshot') {
            chip.classList.add('ok');
            const day = generated ? new Date(generated).toISOString().slice(0, 10) : 'bundled';
            label.textContent = `CP + shiny data · ${day}`;
        } else if (source === 'live') {
            chip.classList.add('ok');
            label.textContent = 'CP + shiny data · live';
        } else if (source === 'offline') {
            chip.classList.add('down');
            label.textContent = 'CP + shiny data · unavailable';
        } else {
            label.textContent = 'CP + shiny data · loading';
        }
    });

    primeData();

    // Autocomplete works immediately off the bundled names, then widens.
    loadPokemonNames().then(names => { pokemonList = names; });

    // ------------------------------------------------------ autocomplete ----

    const matchesFor = value => {
        const query = value.trim().toLowerCase();
        if (!query) return [];
        return pokemonList.filter(p => p.toLowerCase().startsWith(query)).slice(0, MAX_SUGGESTIONS);
    };

    /**
     * ARIA 1.2 combobox: the input owns a listbox, keyboard moves a virtual
     * focus via aria-activedescendant, and the mouse path stays as it was.
     */
    function attachAutocomplete(input, index) {
        const listId = `suggestions-${index}`;
        const list = document.createElement('div');
        list.id = listId;
        list.className = 'suggestions';
        list.setAttribute('role', 'listbox');
        list.hidden = true;
        input.parentNode.appendChild(list);

        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-controls', listId);
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('autocomplete', 'off');

        let options = [];
        let activeIndex = -1;

        function close() {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            activeIndex = -1;
        }

        function setActive(next) {
            if (!options.length) return;
            activeIndex = (next + options.length) % options.length;
            [...list.children].forEach((el, i) => {
                const isActive = i === activeIndex;
                el.classList.toggle('is-active', isActive);
                el.setAttribute('aria-selected', String(isActive));
                if (isActive) {
                    input.setAttribute('aria-activedescendant', el.id);
                    el.scrollIntoView({ block: 'nearest' });
                }
            });
        }

        function choose(name) {
            input.value = name;
            input.style.borderColor = '';
            close();
            fillFromPokemon(index);
        }

        function open(matches) {
            options = matches;
            list.innerHTML = '';
            if (!matches.length) return close();

            matches.forEach((name, i) => {
                const option = document.createElement('div');
                option.id = `${listId}-option-${i}`;
                option.className = 'suggestion';
                option.setAttribute('role', 'option');
                option.setAttribute('aria-selected', 'false');
                option.textContent = name;
                // mousedown would blur the input and close the list before click lands
                option.addEventListener('mousedown', event => event.preventDefault());
                option.addEventListener('click', () => choose(name));
                list.appendChild(option);
            });

            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            activeIndex = -1;
        }

        input.addEventListener('keydown', event => {
            const isOpen = !list.hidden;
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    if (isOpen) setActive(activeIndex + 1);
                    else { open(matchesFor(input.value)); setActive(0); }
                    break;
                case 'ArrowUp':
                    if (!isOpen) break;
                    event.preventDefault();
                    setActive(activeIndex - 1);
                    break;
                case 'Enter':
                    if (isOpen && activeIndex >= 0) {
                        event.preventDefault();
                        choose(options[activeIndex]);
                    }
                    break;
                case 'Escape':
                    if (isOpen) { event.preventDefault(); close(); }
                    break;
                case 'Tab':
                    close();
                    break;
            }
        });

        input.addEventListener('input', () => open(matchesFor(input.value)));
        input.addEventListener('blur', () => setTimeout(close, 120));

        return { close };
    }

    /**
     * Fill CP and shiny for one form row. Every field is looked up and guarded
     * independently — most event types render no CP fields at all, and Max
     * Battles renders hundo without whundo.
     */
    async function fillFromPokemon(index) {
        const name = document.getElementById(`pokemon-${index}`)?.value?.trim();
        if (!name) return;

        const hundoInput = document.getElementById(`hundo-${index}`);
        const whundoInput = document.getElementById(`whundo-${index}`);
        const shinySelect = document.getElementById(`shiny-${index}`);

        const jobs = [];

        if (hundoInput || whundoInput) {
            jobs.push(getCatchCP(name).then(cp => {
                if (hundoInput) hundoInput.value = cp ? cp.hundo : '';
                if (whundoInput) whundoInput.value = cp ? cp.whundo : '';
            }));
        }
        if (shinySelect) {
            jobs.push(isShinyReleased(name).then(released => {
                if (released !== null) shinySelect.value = released ? 'yes' : 'no';
            }));
        }
        await Promise.all(jobs);
    }

    // -------------------------------------------------------- form fields ----

    function addInputs(num) {
        const config = eventConfig[selectedEventType];
        if (!config) return;

        const today = new Date().toISOString().split('T')[0];
        const sections = [];

        for (let i = 0; i < num; i++) {
            let fields = `
                <div class="dynamic-section">
                    <h3>${escapeHTML(selectedEventType)} ${i + 1}</h3>
                    <label>Pokémon: <input type="text" id="pokemon-${i}" required></label>
                    <label>Shiny Available?
                        <select id="shiny-${i}" required>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                        </select>
                    </label>
                    <label>Date: <input type="date" id="date-${i}" value="${today}" required></label>`;

            if (config.bonuses.length) {
                for (let j = 1; j <= config.maxBonuses; j++) {
                    fields += `
                        <label>Bonus ${j}:
                            <select id="bonus${j}-${i}">
                                <option value="None">None</option>
                                ${config.bonuses.map(b => `<option value="${escapeHTML(b)}">${escapeHTML(b)}</option>`).join('')}
                            </select>
                        </label>`;
                }
            }

            for (const field of config.specialFields) {
                const label = field.replace(/^\w/, c => c.toUpperCase());
                fields += `<label>${label}: <input type="text" id="${field}-${i}"></label>`;
            }

            sections.push(fields + '</div>');
        }

        // Build the whole block, then assign once — appending in the loop reparses
        // everything already rendered on every iteration.
        dynamicInputs.innerHTML = sections.join('');

        dynamicInputs.querySelectorAll('input[id^="pokemon-"]').forEach(input => {
            const index = Number(input.id.split('-')[1]);
            attachAutocomplete(input, index);
        });

        dynamicInputs.querySelectorAll('input[required], select[required]').forEach(field => {
            field.addEventListener('input', () => {
                field.style.borderColor = field.value ? '' : 'var(--down)';
            });
        });
    }

    // ---------------------------------------------------------- rendering ----

    function descriptionCard({ imageUrl, name, text }) {
        const image = imageUrl
            ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(name)}" class="pokemon-image">`
            : '<p class="no-image">No image</p>';

        return `<div class="description">
                ${image}
                <textarea readonly aria-label="Description for ${escapeHTML(name)}">${escapeHTML(text)}</textarea>
                <button type="button" class="btn btn--ghost btn--sm" data-copy>Copy</button>
                <span class="copy-feedback" role="status" aria-live="polite"></span>
            </div>`;
    }

    const renderOutput = parts => {
        output.innerHTML = `<h2>Generated Descriptions</h2>${parts.join('')}`;
    };

    // -------------------------------------------------- manual generation ----

    async function generateDescriptions() {
        clearMessages(formMessages);

        const num = parseInt(numDescriptionsInput.value, 10);
        if (isNaN(num) || num < 1) {
            return showMessages(formMessages, notice('Check', 'Enter how many descriptions you need.', 'error'));
        }

        const custom = chosenLocation('location-type', customLocationInput);
        if (custom === '') {
            return showMessages(formMessages, notice('Check', 'Enter a custom location, or switch back to Sundance Park.', 'error'));
        }

        const config = eventConfig[selectedEventType];
        const items = [];
        const problems = [];

        for (let i = 0; i < num; i++) {
            const pokemon = document.getElementById(`pokemon-${i}`)?.value?.trim();
            const dateValue = document.getElementById(`date-${i}`)?.value;

            if (!pokemon || !dateValue) {
                problems.push(notice('Check', `Description ${i + 1} is missing a Pokémon or a date.`, 'error'));
                continue;
            }
            const formattedDate = formatDate(dateValue);
            if (!formattedDate) {
                problems.push(notice('Check', `Description ${i + 1} has a date in the past.`, 'error'));
                continue;
            }

            items.push({
                pokemon,
                formattedDate,
                shinyAvailable: document.getElementById(`shiny-${i}`)?.value === 'yes',
                bonuses: collectBonuses(i, config),
                hundo: document.getElementById(`hundo-${i}`)?.value?.trim() || '',
                whundo: document.getElementById(`whundo-${i}`)?.value?.trim() || '',
                attack: document.getElementById(`attack-${i}`)?.value?.trim() || ''
            });
        }

        // Report every problem at once rather than stopping at the first.
        if (problems.length) showMessages(formMessages, problems.join(''));
        if (!items.length) return;

        const images = await Promise.all(items.map(item => fetchPokemonImage(item.pokemon)));

        renderOutput(items.map((item, i) => descriptionCard({
            imageUrl: images[i],
            name: item.pokemon,
            text: renderDescription({ ...item, eventType: selectedEventType, location: custom ?? undefined })
        })));
    }

    function collectBonuses(index, config) {
        if (!config.bonuses.length) return [];
        const bonuses = [];
        for (let j = 1; j <= config.maxBonuses; j++) {
            const value = document.getElementById(`bonus${j}-${index}`)?.value;
            if (value && value !== 'None') bonuses.push(value);
        }
        return bonuses;
    }

    // ---------------------------------------------------- bulk generation ----

    async function generateBulkDescriptions() {
        clearMessages(bulkMessages);

        const text = bulkInput.value.trim();
        if (!text) {
            return showMessages(bulkMessages, notice('Check', 'Paste an event list first.', 'error'));
        }

        const events = parseBulkTable(text);
        if (!events.length) {
            return showMessages(bulkMessages, notice('Check', 'No events found — the input needs to be a markdown table with Event Name, Details and Date columns.', 'error'));
        }

        const custom = chosenLocation('bulk-location-type', bulkCustomLocation);
        if (custom === '') {
            return showMessages(bulkMessages, notice('Check', 'Enter a custom location, or switch back to Sundance Park.', 'error'));
        }

        const rows = events.map(event => parseEventRow(event));
        const skipped = rows.filter(row => !row.ok).map(row =>
            notice('Skipped', `${escapeHTML(row.reason)} <strong>${escapeHTML(row.event.name)}</strong>` +
                (row.detail ? ` (${escapeHTML(row.detail)})` : ''))
        );
        const usable = rows.filter(row => row.ok);

        if (skipped.length) showMessages(bulkMessages, skipped.join(''));
        if (!usable.length) return;

        const [images, cps, shinyFlags] = await Promise.all([
            Promise.all(usable.map(row => row.pokemon ? fetchPokemonImage(row.pokemon) : null)),
            Promise.all(usable.map(row => row.needsCP ? getCatchCP(row.pokemon) : null)),
            Promise.all(usable.map(row => row.needsShinyCheck ? isShinyReleased(row.pokemon) : null))
        ]);

        renderOutput(usable.map((row, i) => {
            const cp = cps[i];
            return descriptionCard({
                imageUrl: images[i],
                name: row.displayName,
                text: renderDescription({
                    eventType: row.eventType,
                    pokemon: row.displayName,
                    location: custom ?? undefined,
                    formattedDate: row.formattedDate,
                    bonuses: row.bonuses,
                    hundo: cp?.hundo ?? '',
                    whundo: cp?.whundo ?? '',
                    attack: row.attack,
                    // The released-shiny list beats keyword-spotting; fall back if it failed.
                    shinyAvailable: shinyFlags[i] !== null ? shinyFlags[i] : row.shinyFromText
                })
            });
        }));

        output.scrollIntoView({ behavior: 'smooth' });
    }

    // ------------------------------------------------------------- events ----

    Object.keys(eventConfig).forEach(name => {
        const button = document.getElementById(`${name.toLowerCase().replace(/ /g, '-')}-btn`);
        if (!button) return;
        button.addEventListener('click', () => {
            selectedEventType = name;
            document.querySelectorAll('.event-btn').forEach(btn =>
                btn.classList.toggle('is-active', btn === button));
            eventForm.style.display = 'block';
            numDescriptionsInput.value = '1';
            addInputs(1);
            clearMessages(formMessages);
            renderOutput([]);
        });
    });

    numDescriptionsInput.addEventListener('input', debounce(() => {
        let num = parseInt(numDescriptionsInput.value, 10);
        if (num > MAX_DESCRIPTIONS) {
            num = MAX_DESCRIPTIONS;
            numDescriptionsInput.value = String(MAX_DESCRIPTIONS);
        }
        if (num > 0) addInputs(num);
        else dynamicInputs.innerHTML = '';
    }, 300));

    document.getElementById('generate-btn').addEventListener('click', debounce(generateDescriptions, 300));
    document.getElementById('bulk-generate-btn').addEventListener('click', debounce(generateBulkDescriptions, 300));

    document.getElementById('reset-btn').addEventListener('click', () => {
        eventForm.reset();
        dynamicInputs.innerHTML = '';
        eventForm.style.display = 'none';
        selectedEventType = '';
        document.querySelectorAll('.event-btn').forEach(btn => btn.classList.remove('is-active'));
        syncLocationVisibility('location-type', customLocationInput);
        clearMessages(formMessages);
        renderOutput([]);
    });

    document.querySelectorAll('input[name="location-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            syncLocationVisibility('location-type', customLocationInput);
            persist({ locationType: radio.value, customLocation: customLocationInput.value });
        });
    });

    document.querySelectorAll('input[name="bulk-location-type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            syncLocationVisibility('bulk-location-type', bulkCustomLocation);
            persist({ bulkLocationType: radio.value, bulkCustomLocation: bulkCustomLocation.value });
        });
    });

    bulkInput.addEventListener('input', debounce(() => persist({ bulkInput: bulkInput.value }), 400));
    bulkCustomLocation.addEventListener('input', debounce(() => persist({ bulkCustomLocation: bulkCustomLocation.value }), 400));
    customLocationInput.addEventListener('input', debounce(() => persist({ customLocation: customLocationInput.value }), 400));

    // One delegated handler for every Copy button, present and future.
    output.addEventListener('click', async event => {
        const button = event.target.closest('[data-copy]');
        if (!button) return;

        const card = button.closest('.description');
        const textarea = card?.querySelector('textarea');
        const feedback = card?.querySelector('.copy-feedback');
        if (!textarea || !feedback) return;

        try {
            await navigator.clipboard.writeText(textarea.value);
            feedback.textContent = 'Copied';
            feedback.style.color = 'var(--live)';
        } catch (error) {
            feedback.textContent = 'Copy failed';
            feedback.style.color = 'var(--down)';
            console.error('Failed to copy:', error);
        }
        feedback.style.display = 'inline';
        setTimeout(() => { feedback.style.display = 'none'; }, 5000);
    });

    restore();
});
