// Scene Clock — SillyTavern extension
// Tells the bot the current in-world date, time and location on every generation.
// The information is added to the prompt only; nothing appears in chat messages.
// No extra requests to the model are made.

const MODULE = 'scene_clock';     // key in extensionSettings
const META_KEY = 'scene_clock';   // key in chat metadata (per-chat state)
const MAX_RECENT = 5;             // how many recent locations to remember
const MINUTE = 60_000;
const HOUR = 3_600_000;

// English text doubles as the translation key (see locales/*.json).
const DEFAULT_TEMPLATE = '[Current date and time: {weekday}, {date}, {time}.]\n[Current location: {location}.]';

const DEFAULTS = Object.freeze({
    enabled: true,
    language: 'auto',
    template: null,      // null = default template for the current language
    role: 'system',      // system | user | assistant
    depth: 1,            // 0 = after the last message, 1 = before it, ...
    timezone: '',        // '' = this computer's time zone (used in real-time mode only)
    recentLocations: [],
});

const ctx = () => SillyTavern.getContext();

// ───────────────────────── i18n ─────────────────────────
// locales/_manifest.json maps a language name to its file and date locale.
// A translation file maps English UI strings to translated ones.
// Missing translation -> the English string is shown.

let manifest = {};
let table = {};
let activeLocale = 'en-US';

async function fetchJson(relativePath) {
    try {
        const response = await fetch(new URL(relativePath, import.meta.url));
        return response.ok ? await response.json() : null;
    } catch {
        return null;
    }
}

const t = (key) => table[key] ?? key;

function resolveLanguage() {
    const chosen = getSettings().language;
    if (chosen && chosen !== 'auto' && manifest[chosen]) return chosen;
    let guess = '';
    try { guess = String(ctx().getCurrentLocale?.() || ''); } catch { /* ignore */ }
    guess = (guess || globalThis.document?.documentElement?.lang || globalThis.navigator?.language || 'en').toLowerCase();
    for (const [name, info] of Object.entries(manifest)) {
        if (info.locale && guess.startsWith(info.locale.slice(0, 2).toLowerCase())) return name;
    }
    return 'English';
}

async function initI18n() {
    manifest = (await fetchJson('locales/_manifest.json')) || { English: { file: null, locale: 'en-US' } };
    const info = manifest[resolveLanguage()] || {};
    activeLocale = info.locale || 'en-US';
    table = info.file ? ((await fetchJson('locales/' + info.file)) || {}) : {};
}

// ───────────────────────── settings & per-chat state ─────────────────────────

function getSettings() {
    const store = ctx().extensionSettings;
    if (!store[MODULE]) store[MODULE] = {};
    const settings = store[MODULE];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (!(key in settings)) settings[key] = Array.isArray(value) ? [...value] : value;
    }
    return settings;
}

const saveSettings = () => ctx().saveSettingsDebounced();

// Per-chat state:
//   useReal  - true: bot gets the computer's time; false: bot gets "your time"
//   base     - "your time" (ms, wall-clock-as-UTC) at the moment `start`; frozen while useReal
//   start    - Date.now() when `base` was set / resumed
//   location - free text
let detachedState = null; // used when no chat is open yet (not saved)

function newState() {
    return { useReal: true, base: realNow(), start: Date.now(), location: '' };
}

function getChatState() {
    const metadata = ctx().chatMetadata;
    let state;
    if (metadata) {
        state = metadata[META_KEY];
        if (!state || typeof state !== 'object') {
            state = metadata[META_KEY] = newState();
            saveChat();
        }
    } else {
        state = detachedState ??= newState();
    }
    if (!Number.isFinite(state.base) || !Number.isFinite(state.start)) Object.assign(state, newState());
    return state;
}

function saveChat() {
    try {
        const c = ctx();
        (c.saveMetadataDebounced || c.saveMetadata)?.call(c);
    } catch (e) {
        console.warn('[Scene Clock] could not save chat metadata', e);
    }
}

// ───────────────────────── time ─────────────────────────
// "Wall-clock" time is stored as a UTC timestamp (so it has no time zone and no DST jumps).
// Date and time are one value: midnight rolls the date over by itself.

const formatterCache = new Map();

function realNow() {
    let timeZone = getSettings().timezone || undefined;
    const key = timeZone || '';
    let formatter = formatterCache.get(key);
    if (!formatter) {
        const options = { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        try {
            formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone });
        } catch {
            formatter = new Intl.DateTimeFormat('en-CA', options); // invalid zone -> computer's zone
        }
        formatterCache.set(key, formatter);
    }
    const p = {};
    for (const part of formatter.formatToParts(new Date())) p[part.type] = part.value;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

const manualValue = (state) => (state.useReal ? state.base : state.base + (Date.now() - state.start));
const worldNow = (state) => (state.useReal ? realNow() : manualValue(state));

function describe(ms) {
    const date = new Date(ms);
    return {
        weekday: new Intl.DateTimeFormat(activeLocale, { weekday: 'long', timeZone: 'UTC' }).format(date),
        date: new Intl.DateTimeFormat(activeLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date),
        time: date.toISOString().slice(11, 16),
    };
}

function effectiveTemplate() {
    return getSettings().template || t(DEFAULT_TEMPLATE);
}

function buildPromptText() {
    try {
        const state = getChatState();
        const { weekday, date, time } = describe(worldNow(state));
        const location = (state.location || '').trim();
        let lines = effectiveTemplate().split('\n');
        if (!location) lines = lines.filter((line) => !line.includes('{location}'));
        return lines.join('\n')
            .replaceAll('{weekday}', weekday)
            .replaceAll('{date}', date)
            .replaceAll('{time}', time)
            .replaceAll('{location}', location)
            .trim();
    } catch (e) {
        console.warn('[Scene Clock] could not build the message', e);
        return '';
    }
}

// ───────────────────────── prompt injection ─────────────────────────
// SillyTavern calls this (named in manifest.json) before every generation and passes
// the list of messages the prompt is built from. We insert one message into that list.

globalThis.sceneClockInterceptor = async function (chat, _contextSize, _abort, type) {
    try {
        const settings = getSettings();
        if (!settings.enabled || type === 'quiet') return;
        const text = buildPromptText();
        if (!text) return;

        const role = settings.role;
        const isSystem = role === 'system';
        const isUser = role === 'user';
        const depth = Math.max(0, Math.floor(Number(settings.depth) || 0));
        chat.splice(Math.max(0, chat.length - depth), 0, {
            is_user: isUser,
            is_system: isSystem,
            name: isSystem ? 'System' : (isUser ? 'Scene Clock' : 'Assistant'),
            mes: text,
            extra: { isSmallSys: isSystem },
        });
    } catch (e) {
        console.error('[Scene Clock] interceptor failed', e);
    }
};

// ───────────────────────── macros ─────────────────────────
// Optional: {{clock_time}} {{clock_date}} {{clock_weekday}} {{clock_location}}
// can be used by hand in a character card or a prompt.

function registerMacros() {
    const c = ctx();
    const current = () => describe(worldNow(getChatState()));
    const definitions = {
        clock_time: ['Current time (HH:MM) from Scene Clock', () => current().time],
        clock_date: ['Current date from Scene Clock', () => current().date],
        clock_weekday: ['Current day of the week from Scene Clock', () => current().weekday],
        clock_location: ['Current location from Scene Clock', () => (getChatState().location || '').trim()],
    };

    for (const [name, [description, compute]] of Object.entries(definitions)) {
        const handler = () => {
            try { return getSettings().enabled ? compute() : ''; } catch { return ''; }
        };
        try {
            if (c.macros?.register) {
                c.macros.register(name, { category: c.macros.category?.STATE || 'state', description, handler });
            } else if (c.registerMacro) {
                c.registerMacro(name, handler, description); // older SillyTavern
            }
        } catch (e) {
            console.warn('[Scene Clock] could not register macro', name, e);
        }
    }
}

// ───────────────────────── settings panel ─────────────────────────

function bodyHtml() {
    return `
    <label class="checkbox_label"><input type="checkbox" id="sc_enabled"><span>${t('Enable extension')}</span></label>
    <label class="checkbox_label"><input type="checkbox" id="sc_real"><span>${t('Use real time')}</span></label>
    <small class="sc-hint">${t('Uses your computer clock. Turn off to set your own time, which keeps ticking from the point you set.')}</small>

    <div id="sc_manual" class="sc-block">
        <div class="sc-title">${t('Your time')}</div>
        <div class="sc-row">
            <label class="sc-field">${t('Date')}<input type="date" id="sc_date" class="text_pole"></label>
            <label class="sc-field">${t('Time')}<input type="time" id="sc_time" class="text_pole"></label>
        </div>
        <div class="sc-row">
            <div class="menu_button" id="sc_now">${t('Now')}</div>
            <div class="menu_button" data-delta="${15 * MINUTE}">${t('+15 min')}</div>
            <div class="menu_button" data-delta="${HOUR}">${t('+1 hour')}</div>
            <div class="menu_button" data-delta="${24 * HOUR}">${t('+1 day')}</div>
        </div>
    </div>

    <div class="sc-block">
        <label class="sc-field">${t('Location')}
            <input type="text" id="sc_loc" class="text_pole" list="sc_loc_list" placeholder="${t('e.g. Café, Saint Petersburg')}">
            <datalist id="sc_loc_list"></datalist>
        </label>
    </div>

    <div class="sc-block">
        <div class="sc-title">${t('Sent to the bot (not shown in chat):')}</div>
        <pre id="sc_preview" class="sc-preview"></pre>
    </div>

    <details class="sc-advanced">
        <summary>${t('Advanced')}</summary>
        <label class="sc-field">${t('Language')}<select id="sc_lang" class="text_pole"></select></label>
        <label class="sc-field">${t('Message template')}<textarea id="sc_template" class="text_pole" rows="3"></textarea></label>
        <small class="sc-hint">${t('Placeholders: {weekday} {date} {time} {location}. A line with {location} is skipped when the location is empty.')}</small>
        <div class="menu_button" id="sc_template_reset">${t('Reset template')}</div>
        <label class="sc-field">${t('Message role')}
            <select id="sc_role" class="text_pole">
                <option value="system">${t('System')}</option>
                <option value="user">${t('User')}</option>
                <option value="assistant">${t('Assistant')}</option>
            </select>
        </label>
        <label class="sc-field">${t('Insert depth (0 = after the last message, 1 = before it)')}<input type="number" id="sc_depth" class="text_pole" min="0" max="50" step="1"></label>
        <label class="sc-field">${t('Time zone for real time (empty = this computer)')}<input type="text" id="sc_tz" class="text_pole" placeholder="Europe/Moscow"></label>
    </details>`;
}

function renderPanel() {
    const host = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    if (!host.length) return;
    $('#scene_clock_settings').remove();
    host.append(`
    <div id="scene_clock_settings" class="scene-clock">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b id="sc_title"></b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" id="sc_body"></div>
        </div>
    </div>`);
    renderBody();
}

function renderBody() {
    if (!$('#sc_body').length) return;
    const settings = getSettings();
    $('#sc_title').text(t('Scene Clock'));
    $('#sc_body').html(bodyHtml());

    const languages = $('#sc_lang').empty().append($('<option>').val('auto').text(t('Auto')));
    for (const name of Object.keys(manifest)) languages.append($('<option>').val(name).text(name));
    languages.val(manifest[settings.language] ? settings.language : 'auto');

    $('#sc_template').val(effectiveTemplate());
    $('#sc_role').val(settings.role);
    $('#sc_depth').val(settings.depth);
    $('#sc_tz').val(settings.timezone);
    fillRecentLocations();
    bindEvents();
    refreshUI(true);
}

function fillRecentLocations() {
    const list = $('#sc_loc_list').empty();
    for (const place of getSettings().recentLocations) list.append($('<option>').val(place));
}

function rememberLocation(place) {
    if (!place) return;
    const settings = getSettings();
    settings.recentLocations = [place, ...settings.recentLocations.filter((x) => x !== place)].slice(0, MAX_RECENT);
    saveSettings();
    fillRecentLocations();
}

function setUseReal(on) {
    const state = getChatState();
    if (on === state.useReal) return;
    if (on) {
        state.base = manualValue(state); // freeze "your time" where it is
        state.useReal = true;
    } else {
        state.useReal = false;           // resume from the frozen value
        state.start = Date.now();
    }
    saveChat();
    refreshUI(true);
}

function setManual(ms) {
    const state = getChatState();
    state.base = ms;
    state.start = Date.now();
    saveChat();
    refreshUI(true);
}

function applyManualFields() {
    const state = getChatState();
    if (state.useReal) return;
    const date = $('#sc_date').val();
    let time = $('#sc_time').val();
    if (!date || !time) return;
    if (time.length === 5) time += ':00';
    const ms = Date.parse(`${date}T${time}Z`);
    if (Number.isFinite(ms)) setManual(ms);
}

function bindEvents() {
    $('#sc_enabled').on('change', (e) => { getSettings().enabled = e.target.checked; saveSettings(); refreshUI(); });
    $('#sc_real').on('change', (e) => setUseReal(e.target.checked));
    $('#sc_date, #sc_time').on('change', applyManualFields);

    $('#sc_now').on('click', () => { if (!getChatState().useReal) setManual(realNow()); });
    $('#sc_body [data-delta]').on('click', function () {
        const state = getChatState();
        if (!state.useReal) setManual(manualValue(state) + Number($(this).data('delta')));
    });

    $('#sc_loc')
        .on('input', (e) => { getChatState().location = e.target.value; saveChat(); refreshUI(); })
        .on('change', (e) => rememberLocation(e.target.value.trim()));

    $('#sc_lang').on('change', async (e) => {
        getSettings().language = e.target.value;
        saveSettings();
        await initI18n();
        renderBody();
    });
    $('#sc_template').on('input', (e) => { getSettings().template = e.target.value; refreshUI(); saveSettings(); });
    $('#sc_template_reset').on('click', () => {
        getSettings().template = null;
        saveSettings();
        $('#sc_template').val(effectiveTemplate());
        refreshUI();
    });
    $('#sc_role').on('change', (e) => { getSettings().role = e.target.value; saveSettings(); });
    $('#sc_depth').on('change', (e) => {
        const depth = Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0)));
        getSettings().depth = depth;
        e.target.value = depth;
        saveSettings();
    });
    $('#sc_tz').on('change', (e) => {
        const zone = e.target.value.trim();
        if (zone) {
            try {
                new Intl.DateTimeFormat('en', { timeZone: zone });
            } catch {
                globalThis.toastr?.warning(t('Invalid time zone'), t('Scene Clock'));
                e.target.value = getSettings().timezone;
                return;
            }
        }
        getSettings().timezone = zone;
        saveSettings();
        refreshUI();
    });
}

function refreshUI(force = false) {
    if (!$('#sc_body').length) return;
    const settings = getSettings();
    const state = getChatState();

    $('#sc_enabled').prop('checked', settings.enabled);
    $('#sc_real').prop('checked', state.useReal);
    $('#sc_manual').toggleClass('sc-disabled', state.useReal).find('input').prop('disabled', state.useReal);

    // Don't overwrite a field while the person is typing in it.
    if (force || !$('#sc_date, #sc_time').is(':focus')) {
        try {
            const iso = new Date(manualValue(state)).toISOString();
            $('#sc_date').val(iso.slice(0, 10));
            $('#sc_time').val(iso.slice(11, 16));
        } catch { /* date out of range: leave the fields alone */ }
    }
    if (force || !$('#sc_loc').is(':focus')) $('#sc_loc').val(state.location || '');

    $('#sc_preview').text(settings.enabled ? (buildPromptText() || '—') : t('Extension is off'));
}

// ───────────────────────── start ─────────────────────────

jQuery(async () => {
    try {
        getSettings();
        await initI18n();
        renderPanel();
        registerMacros();

        const c = ctx();
        const events = c.eventTypes || c.event_types;
        if (c.eventSource && events?.CHAT_CHANGED) {
            c.eventSource.on(events.CHAT_CHANGED, () => refreshUI(true));
        }
        // Keep the preview (and the fields in "your time" mode) ticking while the panel is open.
        setInterval(() => {
            if ($('#sc_body').is(':visible')) refreshUI();
        }, 1000);
    } catch (e) {
        console.error('[Scene Clock] failed to start', e);
    }
});
