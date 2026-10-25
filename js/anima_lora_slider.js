import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "AnimaLoraSliderStack";
// Must match STACK_INPUT in nodes.py.
const STACK_WIDGET = "lora_stack";

const DEFAULT_ROW = {
    on: true,
    lora: null,
    title: "",       // shown instead of the LoRA path when set
    strength: 1,
    random: false,   // roll a new strength for every queued generation
    min: -2,
    max: 2,
    step: 0.05,
    labelMin: "",
    labelMax: "",
};

// Every block gets an explicit height so the widget's total height can be computed exactly,
// even while the node is off-screen and its DOM can't be measured.
const H = {
    pad: 2,          // root padding, top and bottom
    gap: 6,          // between header, rows and the add button
    header: 22,
    rowPad: 5,       // row padding, top and bottom
    rowTop: 24,      // toggle / name / buttons line
    rowGap: 4,       // between the lines inside a row
    slider: 26,
    configLine: 24,
    add: 26,
};
const CONFIG_LINES = 3;
const CONFIG_H = H.configLine * CONFIG_LINES + H.rowGap * (CONFIG_LINES - 1);
// The frontend insets DOM widgets by this much on every side, taking it out of their height.
const WIDGET_MARGIN = 10;
const MIN_NODE_WIDTH = 400;

// ---------------------------------------------------------------------------
// Styles – injected once
// ---------------------------------------------------------------------------
const STYLE_ID = "anima-lora-slider-styles";
if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .als-root {
            --als-accent: #5ac8ff;
            --als-track: #303040;
            --als-roll: #ffb45a;
            --als-text: var(--input-text, #ddd);
            --als-muted: var(--descrip-text, #999);
            --als-bg: var(--comfy-input-bg, #222);
            --als-border: var(--border-color, #444);
            width: 100%;
            height: 100%;
            overflow: hidden;
            box-sizing: border-box;
            padding: ${H.pad}px 2px;
            display: flex;
            flex-direction: column;
            gap: ${H.gap}px;
            font: 12px/1.2 sans-serif;
            color: var(--als-text);
        }
        .als-root * { box-sizing: border-box; }
        .als-root button {
            font: inherit;
            color: var(--als-text);
            background: var(--als-bg);
            border: 1px solid var(--als-border);
            border-radius: 4px;
            cursor: pointer;
            padding: 0 6px;
        }
        .als-root button:hover { border-color: var(--als-accent); }
        .als-root button:disabled { opacity: 0.35; cursor: default; border-color: var(--als-border); }

        .als-header {
            height: ${H.header}px;
            flex: none;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 0 6px;
            color: var(--als-muted);
        }
        .als-rows { display: flex; flex-direction: column; gap: ${H.gap}px; flex: none; }

        .als-row {
            flex: none;
            display: flex;
            flex-direction: column;
            gap: ${H.rowGap}px;
            padding: ${H.rowPad}px 6px;
            border: 1px solid var(--als-border);
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.18);
            overflow: hidden;
        }
        .als-row.als-off > :not(.als-top),
        .als-row.als-off .als-name { opacity: 0.4; }

        .als-top {
            height: ${H.rowTop}px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .als-top button { height: 22px; min-width: 22px; padding: 0 4px; flex: none; }
        .als-root button.als-name {
            flex: 1 1 auto;
            min-width: 0;
            text-align: left;
            padding: 0 6px;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
        .als-name.als-none { color: var(--als-muted); font-style: italic; }
        .als-root button.als-active { border-color: var(--als-accent); color: var(--als-accent); }
        .als-root button.als-dice.als-active { border-color: var(--als-roll); color: var(--als-roll); }

        /* on/off switch */
        .als-switch {
            position: relative;
            flex: none;
            width: 28px;
            height: 16px;
            border-radius: 8px;
            background: var(--als-track);
            cursor: pointer;
            transition: background 0.15s;
        }
        .als-switch::after {
            content: "";
            position: absolute;
            top: 2px;
            left: 2px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #aaa;
            transition: left 0.15s, background 0.15s;
        }
        .als-switch.als-on { background: rgba(90, 200, 255, 0.45); }
        .als-switch.als-on::after { left: 14px; background: var(--als-accent); }
        .als-switch.als-mixed::after { left: 8px; background: #ccc; }

        .als-slider-line {
            height: ${H.slider}px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .als-end {
            flex: 0 1 auto;
            max-width: 22%;
            color: var(--als-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            user-select: none;
        }
        .als-end.als-min { text-align: right; }
        .als-value {
            flex: none;
            width: 58px;
            height: 22px;
            line-height: 20px;
            text-align: center;
            font: 700 13px 'Courier New', Courier, monospace;
            color: #e8eaf0;
            text-shadow: 0 0 8px rgba(90, 190, 255, 0.55);
            background: rgba(0, 0, 0, 0.30);
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            user-select: none;
        }
        .als-value:hover { background: rgba(90, 190, 255, 0.12); }
        .als-row.als-zero .als-value { color: var(--als-muted); text-shadow: none; }
        .als-row.als-random .als-value { color: var(--als-roll); text-shadow: 0 0 8px rgba(255, 180, 90, 0.55); }
        .als-row.als-random .als-range { --als-accent: var(--als-roll); }
        .als-row.als-zero .als-name { text-decoration: line-through; }
        input.als-value-edit {
            cursor: text;
            border-color: rgba(90, 190, 255, 0.75);
            outline: none;
            padding: 0 2px;
        }

        /* range slider – fill runs from zero (or min) to the value, via --als-a / --als-b */
        .als-range {
            flex: 1 1 auto;
            min-width: 60px;
            -webkit-appearance: none;
            appearance: none;
            height: 18px;
            margin: 0;
            background: transparent;
            cursor: pointer;
            outline: none;
        }
        .als-range::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right,
                var(--als-track) var(--als-a, 0%), var(--als-accent) var(--als-a, 0%),
                var(--als-accent) var(--als-b, 0%), var(--als-track) var(--als-b, 0%));
        }
        .als-range::-moz-range-track {
            height: 6px;
            border-radius: 3px;
            background: linear-gradient(to right,
                var(--als-track) var(--als-a, 0%), var(--als-accent) var(--als-a, 0%),
                var(--als-accent) var(--als-b, 0%), var(--als-track) var(--als-b, 0%));
        }
        .als-range::-moz-range-progress { background: transparent; }
        .als-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px;
            height: 14px;
            margin-top: -4px;
            border-radius: 50%;
            background: var(--als-accent);
            box-shadow: 0 0 6px rgba(90, 200, 255, 0.85);
            transition: transform 0.1s;
        }
        .als-range::-webkit-slider-thumb:hover { transform: scale(1.25); }
        .als-range::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border: none;
            border-radius: 50%;
            background: var(--als-accent);
            box-shadow: 0 0 6px rgba(90, 200, 255, 0.85);
        }

        .als-config {
            height: ${CONFIG_H}px;
            display: grid;
            grid-template-rows: repeat(${CONFIG_LINES}, ${H.configLine}px);
            row-gap: ${H.rowGap}px;
            padding-top: 0;
        }
        .als-config-line { display: flex; align-items: center; gap: 4px; min-width: 0; }
        .als-config label {
            flex: none;
            color: var(--als-muted);
            padding-left: 2px;
        }
        .als-config input {
            min-width: 0;
            height: 22px;
            font: inherit;
            color: var(--als-text);
            background: var(--als-bg);
            border: 1px solid var(--als-border);
            border-radius: 4px;
            padding: 0 4px;
        }
        .als-config input:focus { outline: none; border-color: var(--als-accent); }
        .als-config input[type=number] { flex: 1 1 0; width: 0; }
        .als-config input[type=text] { flex: 1 1 0; width: 0; }

        .als-root button.als-add {
            height: ${H.add}px;
            flex: none;
            width: 100%;
        }

        /* LoRA picker popup (lives on document.body, outside the canvas transform) */
        .als-picker {
            position: fixed;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            width: 420px;
            max-width: 90vw;
            max-height: 360px;
            background: var(--comfy-menu-bg, #353535);
            border: 1px solid var(--border-color, #555);
            border-radius: 6px;
            box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
            font: 13px sans-serif;
            color: var(--input-text, #ddd);
            overflow: hidden;
        }
        .als-picker input {
            margin: 6px;
            padding: 4px 6px;
            font: inherit;
            color: inherit;
            background: var(--comfy-input-bg, #222);
            border: 1px solid var(--border-color, #555);
            border-radius: 4px;
            outline: none;
        }
        .als-picker-list { overflow-y: auto; padding-bottom: 4px; }
        .als-picker-item {
            padding: 3px 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: pointer;
        }
        .als-picker-item.als-current { color: #5ac8ff; }
        .als-picker-item.als-hl { background: rgba(90, 190, 255, 0.2); }
        .als-picker-empty { padding: 6px 10px; color: var(--descrip-text, #999); font-style: italic; }
    `;
    document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function el(tag, className, props) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (props) Object.assign(e, props);
    return e;
}

function num(v, fallback) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

// Decimal places needed to show values on a `step` grid (0.05 → 2, 1 → 0, 1e-3 → 3).
function decimalsOf(step) {
    const s = String(step);
    if (s.includes("e-")) return Math.min(6, parseInt(s.split("e-")[1]));
    const i = s.indexOf(".");
    return i < 0 ? 0 : Math.min(6, s.length - i - 1);
}

// Snap onto the step grid. The grid is anchored at 0 whenever 0 is in range, so a slider
// can always be dragged exactly back to 0 (which disables the LoRA) whatever min/step are.
function snap(v, row) {
    const base = row.min <= 0 && row.max >= 0 ? 0 : row.min;
    const snapped = row.step > 0 ? base + Math.round((v - base) / row.step) * row.step : v;
    return clamp(parseFloat(snapped.toFixed(10)), row.min, row.max);
}

// A random strength on the same grid the slider snaps to (see `snap`), min and max included.
function rollStrength(row) {
    const base = row.min <= 0 && row.max >= 0 ? 0 : row.min;
    const kMin = Math.ceil((row.min - base) / row.step - 1e-9);
    const kMax = Math.floor((row.max - base) / row.step + 1e-9);
    if (kMax < kMin) return clamp(base, row.min, row.max);
    const k = kMin + Math.floor(Math.random() * (kMax - kMin + 1));
    return clamp(parseFloat((base + k * row.step).toFixed(10)), row.min, row.max);
}

function normalizeRow(raw) {
    const row = { ...DEFAULT_ROW, ...(raw && typeof raw === "object" ? raw : {}) };
    row.on = row.on !== false;
    row.lora = typeof row.lora === "string" && row.lora ? row.lora : null;
    row.title = row.title == null ? "" : String(row.title);
    row.random = row.random === true;
    row.min = num(row.min, DEFAULT_ROW.min);
    row.max = num(row.max, DEFAULT_ROW.max);
    if (row.min > row.max) [row.min, row.max] = [row.max, row.min];
    row.step = num(row.step, DEFAULT_ROW.step);
    if (!(row.step > 0)) row.step = DEFAULT_ROW.step;
    row.strength = clamp(num(row.strength, DEFAULT_ROW.strength), row.min, row.max);
    row.labelMin = row.labelMin == null ? "" : String(row.labelMin);
    row.labelMax = row.labelMax == null ? "" : String(row.labelMax);
    return row;
}

function rowHeight(row, configOpen) {
    return H.rowPad * 2 + H.rowTop + H.rowGap + H.slider + (configOpen ? H.rowGap + CONFIG_H : 0);
}

// ---------------------------------------------------------------------------
// LoRA list (shared by every node)
// ---------------------------------------------------------------------------
let lorasPromise = null;
function getLoras(force = false) {
    if (!lorasPromise || force) {
        lorasPromise = api
            .fetchApi("/models/loras")
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []);
    }
    return lorasPromise;
}

// ---------------------------------------------------------------------------
// Searchable LoRA picker popup
// ---------------------------------------------------------------------------
let openPicker = null;

function closePicker() {
    openPicker?.close();
}

async function showLoraPicker(anchor, current, onChoose) {
    closePicker();
    const loras = await getLoras();

    const popup = el("div", "als-picker");
    const search = el("input", "", { type: "text", placeholder: "Search LoRAs…" });
    const list = el("div", "als-picker-list");
    popup.append(search, list);

    let items = [];
    let hl = 0;

    function render() {
        const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        items = loras.filter((l) => terms.every((t) => l.toLowerCase().includes(t)));
        list.replaceChildren();
        if (!items.length) {
            list.append(el("div", "als-picker-empty", {
                textContent: loras.length ? "No matches" : "No LoRAs found in models/loras",
            }));
            return;
        }
        hl = clamp(hl, 0, items.length - 1);
        items.forEach((name, i) => {
            const item = el("div", "als-picker-item", { textContent: name, title: name });
            if (name === current) item.classList.add("als-current");
            if (i === hl) item.classList.add("als-hl");
            item.addEventListener("mouseenter", () => setHl(i, false));
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                choose(name);
            });
            list.append(item);
        });
    }

    function setHl(i, scroll = true) {
        list.children[hl]?.classList.remove("als-hl");
        hl = i;
        const item = list.children[hl];
        item?.classList.add("als-hl");
        if (scroll) item?.scrollIntoView({ block: "nearest" });
    }

    function choose(name) {
        close();
        onChoose(name);
    }

    function onOutside(e) {
        if (!popup.contains(e.target)) close();
    }

    function close() {
        document.removeEventListener("pointerdown", onOutside, true);
        popup.remove();
        if (openPicker?.popup === popup) openPicker = null;
    }

    search.addEventListener("input", () => { hl = 0; render(); });
    search.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) setHl((hl + 1) % items.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); if (items.length) setHl((hl - 1 + items.length) % items.length); }
        else if (e.key === "Enter") { e.preventDefault(); if (items[hl]) choose(items[hl]); }
        else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    popup.addEventListener("wheel", (e) => e.stopPropagation());

    hl = Math.max(0, loras.indexOf(current));
    render();
    document.body.append(popup);

    // Below the anchor if it fits, otherwise above.
    const r = anchor.getBoundingClientRect();
    const ph = popup.offsetHeight;
    const top = r.bottom + 2 + ph <= window.innerHeight ? r.bottom + 2 : Math.max(4, r.top - 2 - ph);
    const left = clamp(r.left, 4, Math.max(4, window.innerWidth - popup.offsetWidth - 4));
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    setHl(hl);
    search.focus();
    document.addEventListener("pointerdown", onOutside, true);
    openPicker = { popup, close };
}

// ---------------------------------------------------------------------------
// The stack widget
// ---------------------------------------------------------------------------
function createStack(node) {
    let rows = [];
    // Which rows have their configuration open. UI state only — never serialized.
    const configOpen = new WeakSet();

    const root = el("div", "als-root");
    const header = el("div", "als-header");
    const toggleAll = el("div", "als-switch", { title: "Toggle all LoRAs" });
    header.append(toggleAll, el("span", "", { textContent: "Toggle all" }));
    const rowsEl = el("div", "als-rows");
    const addBtn = el("button", "als-add", { textContent: "➕ Add LoRA" });
    root.append(header, rowsEl, addBtn);

    // Keep wheel / pointer interaction inside the widget from panning or zooming the canvas.
    root.addEventListener("wheel", (e) => e.stopPropagation());

    toggleAll.addEventListener("click", () => {
        const allOn = rows.length && rows.every((r) => r.on);
        rows.forEach((r) => (r.on = !allOn));
        render();
    });

    addBtn.addEventListener("click", () => {
        showLoraPicker(addBtn, null, (lora) => {
            rows.push(normalizeRow({ lora }));
            render();
        });
    });

    function totalHeight() {
        let h = H.pad * 2 + H.add;
        if (rows.length) {
            h += H.header + H.gap;
            h += rows.reduce((sum, r) => sum + rowHeight(r, configOpen.has(r)), 0);
            h += H.gap * rows.length;   // between rows, plus rows → add button
        }
        return h;
    }

    function resizeNode() {
        const size = node.computeSize();
        node.setSize([Math.max(node.size[0], size[0], MIN_NODE_WIDTH), size[1]]);
        node.setDirtyCanvas(true, true);
    }

    function updateHeader() {
        header.style.display = rows.length ? "" : "none";
        rowsEl.style.display = rows.length ? "" : "none";
        const on = rows.filter((r) => r.on).length;
        toggleAll.classList.toggle("als-on", rows.length > 0 && on === rows.length);
        toggleAll.classList.toggle("als-mixed", on > 0 && on < rows.length);
    }

    function buildRow(row, index) {
        const rowEl = el("div", "als-row");
        const open = configOpen.has(row);
        rowEl.style.height = `${rowHeight(row, open)}px`;

        // — top line: toggle, lora name, config, move, remove —
        const top = el("div", "als-top");
        const sw = el("div", "als-switch", { title: "Enable / disable this LoRA" });
        const name = el("button", "als-name");
        const dice = el("button", "als-dice", { textContent: "🎲" });
        const gear = el("button", "als-gear", { textContent: "⚙", title: "Configure title and slider" });
        const up = el("button", "", { textContent: "▲", title: "Move up", disabled: index === 0 });
        const down = el("button", "", { textContent: "▼", title: "Move down", disabled: index === rows.length - 1 });
        const del = el("button", "", { textContent: "✕", title: "Remove" });
        gear.classList.toggle("als-active", open);
        top.append(sw, name, dice, gear, up, down, del);

        // — slider line: min label, range, max label, value —
        const line = el("div", "als-slider-line");
        const endMin = el("span", "als-end als-min");
        const range = el("input", "als-range", { type: "range", step: "any" });
        const endMax = el("span", "als-end als-max");
        const value = el("div", "als-value", { title: "Click to type a value · scroll to nudge · double-click the slider to reset to 0" });
        line.append(endMin, range, endMax, value);
        rowEl.append(top, line);

        function refresh() {
            const dec = decimalsOf(row.step);
            rowEl.classList.toggle("als-off", !row.on);
            rowEl.classList.toggle("als-zero", row.strength === 0);
            rowEl.classList.toggle("als-random", row.random);
            rowEl.title = row.strength === 0 ? "Strength is 0 — this LoRA will not be loaded" : "";
            sw.classList.toggle("als-on", row.on);

            name.textContent = row.lora ? row.title || row.lora : "Click to choose a LoRA";
            name.title = row.lora && row.title ? `${row.title} — ${row.lora}` : row.lora ?? "";
            name.classList.toggle("als-none", !row.lora);

            dice.classList.toggle("als-active", row.random);
            dice.title = row.random
                ? "Random is on: a new strength between min and max (on the step grid) is rolled for every generation. Click to turn off."
                : "Roll a random strength for every generation";

            endMin.textContent = row.labelMin || row.min.toFixed(dec);
            endMax.textContent = row.labelMax || row.max.toFixed(dec);
            endMin.title = `${row.labelMin ? row.labelMin + " · " : ""}min ${row.min}`;
            endMax.title = `${row.labelMax ? row.labelMax + " · " : ""}max ${row.max}`;

            range.min = row.min;
            range.max = row.max;
            range.value = row.strength;
            const span = row.max - row.min;
            const pct = (v) => (span > 0 ? ((v - row.min) / span) * 100 : 0);
            const origin = clamp(0, row.min, row.max);
            range.style.setProperty("--als-a", `${Math.min(pct(origin), pct(row.strength))}%`);
            range.style.setProperty("--als-b", `${Math.max(pct(origin), pct(row.strength))}%`);

            value.textContent = row.strength.toFixed(dec);
        }

        function setStrength(v) {
            row.strength = snap(v, row);
            refresh();
        }

        sw.addEventListener("click", () => { row.on = !row.on; refresh(); updateHeader(); });
        dice.addEventListener("click", () => { row.random = !row.random; refresh(); });
        name.addEventListener("click", () => {
            showLoraPicker(name, row.lora, (lora) => { row.lora = lora; refresh(); });
        });
        gear.addEventListener("click", () => {
            if (configOpen.has(row)) configOpen.delete(row);
            else configOpen.add(row);
            render();
        });
        up.addEventListener("click", () => { [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]]; render(); });
        down.addEventListener("click", () => { [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]]; render(); });
        del.addEventListener("click", () => { rows.splice(index, 1); render(); });

        range.addEventListener("input", () => setStrength(parseFloat(range.value)));
        range.addEventListener("dblclick", () => setStrength(0));

        function onWheel(e) {
            e.preventDefault();
            e.stopPropagation();
            setStrength(row.strength + (e.deltaY < 0 ? row.step : -row.step));
        }
        range.addEventListener("wheel", onWheel, { passive: false });
        value.addEventListener("wheel", onWheel, { passive: false });

        value.addEventListener("click", () => {
            const edit = el("input", "als-value als-value-edit", {
                type: "number",
                value: row.strength.toFixed(decimalsOf(row.step)),
                step: row.step,
            });
            value.replaceWith(edit);
            edit.focus();
            edit.select();
            let done = false;
            function finish(commit) {
                if (done) return;
                done = true;
                // Typed values are clamped but not snapped, so off-grid strengths stay possible.
                const v = parseFloat(edit.value);
                if (commit && Number.isFinite(v)) row.strength = clamp(v, row.min, row.max);
                edit.replaceWith(value);
                refresh();
            }
            edit.addEventListener("blur", () => finish(true));
            edit.addEventListener("keydown", (e) => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); finish(true); }
                if (e.key === "Escape") { e.preventDefault(); finish(false); }
            });
        });

        if (open) rowEl.append(buildConfig(row, refresh));
        refresh();
        return rowEl;
    }

    function buildConfig(row, refreshRow) {
        const config = el("div", "als-config");

        function field(label, type, key, apply) {
            const lab = el("label", "", { textContent: label });
            const input = el("input", "", { type, value: row[key] });
            if (type === "number") input.step = "any";
            input.addEventListener("keydown", (e) => {
                e.stopPropagation();
                if (e.key === "Enter") input.blur();
            });
            input.addEventListener("change", () => {
                apply(input);
                refreshRow();
                syncInputs();
            });
            return { lab, input, key };
        }

        const fields = [
            field("Min", "number", "min", (i) => {
                row.min = num(i.value, row.min);
                if (row.min > row.max) row.max = row.min;
                row.strength = clamp(row.strength, row.min, row.max);
            }),
            field("Max", "number", "max", (i) => {
                row.max = num(i.value, row.max);
                if (row.max < row.min) row.min = row.max;
                row.strength = clamp(row.strength, row.min, row.max);
            }),
            field("Step", "number", "step", (i) => {
                const s = num(i.value, row.step);
                if (s > 0) row.step = s;
            }),
            field("Min label", "text", "labelMin", (i) => { row.labelMin = i.value; }),
            field("Max label", "text", "labelMax", (i) => { row.labelMax = i.value; }),
            field("Title", "text", "title", (i) => { row.title = i.value.trim(); }),
        ];
        fields.at(-1).input.placeholder = "Optional name shown instead of the file path";

        // Reflect corrections (e.g. min pushed up to max) back into the inputs.
        function syncInputs() {
            for (const f of fields) if (document.activeElement !== f.input) f.input.value = row[f.key];
        }

        const lines = [fields.slice(5), fields.slice(0, 3), fields.slice(3, 5)].map((group) => {
            const line = el("div", "als-config-line");
            for (const f of group) line.append(f.lab, f.input);
            return line;
        });
        config.append(...lines);
        return config;
    }

    function render() {
        closePicker();
        rowsEl.replaceChildren(...rows.map(buildRow));
        updateHeader();
        resizeNode();
    }

    // Called once per queued generation, before the prompt is built, so the rolled values are
    // what gets sent, shown on the sliders, and saved in the generated image's workflow.
    function rollRandom() {
        let changed = false;
        for (const row of rows) {
            if (row.on && row.random) {
                row.strength = rollStrength(row);
                changed = true;
            }
        }
        if (changed) render();
    }

    return {
        element: root,
        render,
        rollRandom,
        totalHeight,
        getValue: () => ({ loras: rows.map((r) => ({ ...r })) }),
        setValue: (v) => {
            const list = Array.isArray(v?.loras) ? v.loras : [];
            rows = list.map(normalizeRow);
            render();
        },
    };
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------
app.registerExtension({
    name: "Anima.LoraSliderStack",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);
            getLoras();

            const stack = createStack(this);
            this._alsStack = stack;
            const height = () => stack.totalHeight() + WIDGET_MARGIN * 2;
            const widget = this.addDOMWidget(STACK_WIDGET, "anima_lora_stack", stack.element, {
                getValue: stack.getValue,
                setValue: stack.setValue,
                getMinHeight: height,
                getMaxHeight: height,
                getHeight: height,
                margin: WIDGET_MARGIN,
            });
            widget.beforeQueued = () => stack.rollRandom();
            stack.render();
            return r;
        };

        // Pressing "R" (refresh node definitions) also refreshes our LoRA list.
        const refreshComboInNode = nodeType.prototype.refreshComboInNode;
        nodeType.prototype.refreshComboInNode = function () {
            getLoras(true);
            return refreshComboInNode?.apply(this, arguments);
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            closePicker();
            return onRemoved?.apply(this, arguments);
        };
    },
});
