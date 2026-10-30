import { mainLanguage, withMainLanguage, loadSettings } from "./settings-model.js";
import { others, pinnedIds, togglePin } from "./extensions-model.js";
import { available as rangaPrivate, call } from "./ranga-private.js";
import { loadContainers, createContainer, updateContainer, deleteContainer, CONTAINER_COLORS, CONTAINER_ICONS } from "./containers-model.js";
import { glyph } from "./kurobe/icons.mjs";
import { loadAliases, validAlias, SCOPES } from "./aliases-model.js";
import { typed, shown } from "./browser-prefs.js";
import { current, assign, reset, toMap, label, fromEvent, SHORTCUTS } from "./shortcuts-model.js";

const themeStyle = document.getElementById("ranga-theme");
let settings = loadSettings((await chrome.storage.local.get("settings")).settings);
let themeCss = "";

function paint() {
  for (const input of document.querySelectorAll("input[type=checkbox][data-key]")) input.checked = settings[input.dataset.key];
  for (const input of document.querySelectorAll("input[type=range][data-key]")) {
    input.value = settings[input.dataset.key];
    input.style.setProperty("--k-slider-fill", `${input.value}%`);
    document.getElementById(`${input.dataset.key}-value`).textContent = `${input.value}%`;
  }
  for (const group of document.querySelectorAll(".k-segmented[data-key]")) {
    for (const option of group.querySelectorAll("[data-value]")) {
      option.setAttribute("aria-pressed", String(option.dataset.value === String(settings[group.dataset.key])));
    }
  }
  themeStyle.textContent = settings.followCielTheme ? themeCss : "";
}

async function save(key, value) {
  settings = loadSettings({ ...settings, [key]: value });
  await chrome.storage.local.set({ settings });
  if (key === "peekPinnedLinks" || key === "littleWindowLinks") chrome.runtime.sendMessage({ type: "links" }).catch(() => {});
  paint();
}

for (const input of document.querySelectorAll("input[type=checkbox][data-key]")) {
  input.addEventListener("change", () => save(input.dataset.key, input.checked));
}
for (const input of document.querySelectorAll("input[type=range][data-key]")) {
  input.addEventListener("input", () => {
    input.style.setProperty("--k-slider-fill", `${input.value}%`);
    document.getElementById(`${input.dataset.key}-value`).textContent = `${input.value}%`;
  });
  input.addEventListener("change", async () => {
    await save(input.dataset.key, Number(input.value));
    if (input.dataset.key === "materialOpacity") themePort.postMessage({ type: "set-opacity", value: Number(input.value) });
  });
}
for (const group of document.querySelectorAll(".k-segmented[data-key]")) {
  for (const option of group.querySelectorAll("[data-value]")) {
    option.addEventListener("click", () => save(group.dataset.key, group.dataset.type === "number" ? Number(option.dataset.value) : option.dataset.value));
  }
}

const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => {
  if (msg.type !== "theme") return;
  themeCss = msg.css;
  paint();
});

async function paintExtensions() {
  if (!rangaPrivate) return;
  const { id } = await chrome.windows.getCurrent();
  const actions = others(await call("getExtensionActions", id).catch(() => []), chrome.runtime.id);
  const stored = await chrome.storage.local.get("pinnedExtensions");
  let pins = pinnedIds(stored.pinnedExtensions, actions);
  document.getElementById("extensions-hint").hidden = actions.length === 0;
  document.getElementById("extension-settings").replaceChildren(...actions.map((action) => {
    const label = document.createElement("label");
    label.className = "setting";
    const text = document.createElement("span");
    text.className = "text extension-name";
    const icon = Object.assign(document.createElement("img"), { src: action.icon, alt: "" });
    const name = Object.assign(document.createElement("span"), { className: "k-type-panel", textContent: action.name });
    text.append(icon, name);
    const input = Object.assign(document.createElement("input"), { className: "k-switch", type: "checkbox", checked: pins.includes(action.id) });
    input.addEventListener("change", async () => {
      pins = togglePin(pins, action.id);
      await chrome.storage.local.set({ pinnedExtensions: pins });
    });
    label.append(text, input);
    return label;
  }));
}

function next(list, value) {
  return list[(list.indexOf(value) + 1) % list.length];
}

async function saveContainers(list) {
  await chrome.storage.local.set({ containers: list });
  paintContainers();
}

async function paintContainers() {
  if (!rangaPrivate) return;
  const list = loadContainers((await chrome.storage.local.get("containers")).containers);
  document.getElementById("containers").hidden = false;
  buildNav();
  document.getElementById("container-settings").replaceChildren(...list.map((c) => {
    const row = document.createElement("div");
    row.className = "setting container-row";
    const text = document.createElement("span");
    text.className = "text container-name";
    const icon = Object.assign(document.createElement("button"), { className: "container-icon k-state", title: "Trocar ícone", textContent: glyph(c.icon) });
    icon.style.setProperty("--container-color", c.color);
    icon.onclick = () => saveContainers(updateContainer(list, c.id, { icon: next(CONTAINER_ICONS, c.icon) }));
    const dot = Object.assign(document.createElement("button"), { className: "container-dot", title: "Trocar cor" });
    dot.style.background = c.color;
    dot.onclick = () => saveContainers(updateContainer(list, c.id, { color: next(CONTAINER_COLORS, c.color) }));
    const name = Object.assign(document.createElement("input"), { className: "k-text-field k-type-label", value: c.name, maxLength: 32 });
    name.addEventListener("change", () => saveContainers(updateContainer(list, c.id, { name: name.value })));
    text.append(icon, dot, name);
    const actions = document.createElement("span");
    actions.className = "container-actions";
    const remove = Object.assign(document.createElement("button"), { className: "k-icon-button k-state", title: "Apagar grupo" });
    remove.innerHTML = `<span class="k-icon">${glyph("trash-2")}</span>`;
    remove.onclick = () => saveContainers(deleteContainer(list, c.id));
    actions.append(remove);
    row.append(text, actions);
    return row;
  }));
}

document.getElementById("container-new").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = e.target.elements.name;
  const list = loadContainers((await chrome.storage.local.get("containers")).containers);
  try {
    await saveContainers(createContainer(list, { name: input.value }));
    input.value = "";
  } catch {
    input.focus();
  }
});

async function storedAliases() {
  return loadAliases((await chrome.storage.local.get("spotlightAliases")).spotlightAliases);
}

async function saveAliases(list) {
  await chrome.storage.local.set({ spotlightAliases: list });
  paintAliases();
}

function aliasField(value, className, placeholder, onChange) {
  const input = Object.assign(document.createElement("input"), { className: `k-text-field k-type-label ${className}`, value, placeholder, autocomplete: "off" });
  input.addEventListener("change", () => {
    const ok = onChange(input.value.trim());
    input.setAttribute("aria-invalid", String(!ok));
  });
  return input;
}

async function paintAliases() {
  const list = await storedAliases();
  const update = (i, patch) => {
    const next = list.map((a, j) => (j === i ? { ...a, ...patch } : a));
    const unique = new Set(next.map((a) => a.alias.toLowerCase())).size === next.length;
    if (!validAlias(next[i]) || !unique) return false;
    saveAliases(next);
    return true;
  };
  document.getElementById("alias-settings").replaceChildren(...list.map((a, i) => {
    const row = document.createElement("div");
    row.className = "setting alias-row";
    const key = aliasField(a.alias, "alias-key", "alias", (alias) => update(i, { alias }));
    key.maxLength = 8;
    row.append(key);
    if (a.scope) {
      row.append(Object.assign(document.createElement("span"), { className: "alias-scope k-type-label", textContent: `Procura em ${SCOPES[a.scope]}` }));
    } else {
      row.append(aliasField(a.name, "alias-name", "Nome do site", (name) => update(i, { name })), aliasField(a.url, "alias-url", "https://site.com/busca?q=%s", (url) => update(i, { url })));
    }
    const remove = Object.assign(document.createElement("button"), { className: "k-icon-button k-state", type: "button", title: "Apagar alias" });
    remove.innerHTML = `<span class="k-icon">${glyph("trash-2")}</span>`;
    remove.onclick = () => saveAliases(list.filter((_, j) => j !== i));
    row.append(remove);
    return row;
  }));
}

document.getElementById("alias-new").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target.elements;
  const entry = { alias: form.alias.value.trim(), name: form.name.value.trim(), url: form.url.value.trim() };
  const list = await storedAliases();
  if (!validAlias(entry) || list.some((a) => a.alias.toLowerCase() === entry.alias.toLowerCase())) {
    form.alias.focus();
    return;
  }
  await saveAliases([...list, entry]);
  e.target.reset();
});
document.getElementById("aliases-reset").onclick = async () => {
  await chrome.storage.local.remove("spotlightAliases");
  paintAliases();
};

async function paintBrowserPrefs() {
  if (!chrome.settingsPrivate) return;
  const prefs = new Map((await chrome.settingsPrivate.getAllPrefs()).map((p) => [p.key, p]));
  for (const input of document.querySelectorAll("input[type=checkbox][data-pref]")) {
    const pref = prefs.get(input.dataset.pref);
    input.closest(".setting").hidden = !pref;
    if (!pref) continue;
    input.checked = Boolean(pref.value);
    input.disabled = pref.enforcement === "ENFORCED";
  }
  for (const group of document.querySelectorAll(".k-segmented[data-pref]")) {
    const pref = prefs.get(group.dataset.pref);
    group.closest(".setting").hidden = !pref;
    if (!pref) continue;
    for (const option of group.querySelectorAll("[data-value]")) option.setAttribute("aria-pressed", String(option.dataset.value === shown(pref.value)));
  }
  const dir = prefs.get("download.default_directory")?.value;
  document.getElementById("download-dir").textContent = dir ? `Desligado, salva direto em ${dir}.` : "";
  document.getElementById("dictionaries").textContent = languageNames(prefs.get("spellcheck.dictionaries")?.value ?? []);
  const accept = String(prefs.get("intl.accept_languages")?.value ?? "");
  document.getElementById("languages").textContent = languageNames(accept.split(",").filter(Boolean));
  for (const option of document.querySelectorAll("#main-language [data-value]")) {
    option.setAttribute("aria-pressed", String(option.dataset.value === mainLanguage(accept)));
    option.onclick = async () => {
      await chrome.settingsPrivate.setPref("intl.accept_languages", withMainLanguage(accept, option.dataset.value)).catch(() => {});
      paintBrowserPrefs();
    };
  }
  const master = document.querySelector('[data-pref="helium.services.enabled"]');
  const services = Boolean(prefs.get("helium.services.enabled")?.value && prefs.get("helium.services.user_consented")?.value);
  master.checked = services;
  for (const input of document.querySelectorAll('#servicos input[data-pref^="helium.services."]')) {
    if (input !== master) input.disabled = !services || input.disabled;
  }
  document.getElementById("servicos").hidden = false;
  buildNav();
}

for (const input of document.querySelectorAll("input[type=checkbox][data-pref]")) {
  input.addEventListener("change", async () => {
    if (input.dataset.pref === "helium.services.enabled" && input.checked) {
      await chrome.settingsPrivate.setPref("helium.services.user_consented", true);
      await chrome.settingsPrivate.setPref("helium.services.schema_version", 1).catch(() => {});
    }
    await chrome.settingsPrivate.setPref(input.dataset.pref, input.checked);
    paintBrowserPrefs();
  });
}
document.getElementById("ublock-dashboard").onclick = () => chrome.tabs.create({ url: "chrome-extension://blockjmkbacgjkknlgpkjjiijinjdanf/dashboard.html" });
for (const group of document.querySelectorAll(".k-segmented[data-pref]")) {
  for (const option of group.querySelectorAll("[data-value]")) {
    option.addEventListener("click", () => chrome.settingsPrivate.setPref(group.dataset.pref, typed(group.dataset.type, option.dataset.value)).then(paintBrowserPrefs));
  }
}
chrome.settingsPrivate?.onPrefsChanged.addListener(paintBrowserPrefs);

paint();
paintExtensions();
paintContainers();
paintAliases();
paintBrowserPrefs();

let recording = null;

async function storedShortcuts() {
  return (await chrome.storage.local.get("shortcuts")).shortcuts ?? {};
}

async function saveShortcuts(next) {
  recording = null;
  await chrome.storage.local.set({ shortcuts: next });
  paintShortcuts();
}

function chips(keys) {
  const parts = label(keys);
  if (!parts.length) return [Object.assign(document.createElement("span"), { className: "shortcut-none k-type-label", textContent: "Sem atalho" })];
  return parts.map((p) => Object.assign(document.createElement("kbd"), { className: "shortcut-key k-type-label", textContent: p }));
}

async function stopRecording() {
  recording = null;
  await call("setShortcuts", toMap(await storedShortcuts())).catch(() => {});
  paintShortcuts();
}

async function paintShortcuts() {
  if (!rangaPrivate) return;
  const stored = await storedShortcuts();
  document.getElementById("atalhos").hidden = false;
  buildNav();
  document.getElementById("shortcut-settings").replaceChildren(...current(stored).map((s) => {
    const row = document.createElement("div");
    row.className = "setting shortcut-row";
    const text = document.createElement("span");
    text.className = "text";
    text.append(Object.assign(document.createElement("span"), { className: "k-type-panel", textContent: s.title }));
    if (s.hint) text.append(Object.assign(document.createElement("span"), { className: "k-type-caption hint", textContent: s.hint }));
    const actions = document.createElement("span");
    actions.className = "shortcut-actions";
    const keys = document.createElement("button");
    keys.className = "shortcut-keys k-state" + (recording === s.command ? " shortcut-keys--recording" : "");
    keys.title = "Gravar outro atalho";
    if (recording === s.command) keys.append(Object.assign(document.createElement("span"), { className: "k-type-label", textContent: "Pressione as teclas…" }));
    else keys.append(...chips(s.keys));
    keys.onclick = async () => {
      recording = s.command;
      await call("setShortcuts", {}).catch(() => {});
      paintShortcuts();
    };
    actions.append(keys);
    const original = SHORTCUTS.find((d) => d.command === s.command).keys;
    if (s.keys !== original) {
      const back = Object.assign(document.createElement("button"), { className: "k-icon-button k-state", title: `Voltar ao padrão (${original || "sem atalho"})` });
      back.innerHTML = `<span class="k-icon">${glyph("rotate-ccw")}</span>`;
      back.onclick = async () => saveShortcuts(reset(await storedShortcuts(), s.command));
      actions.append(back);
    }
    row.append(text, actions);
    return row;
  }));
}

document.addEventListener("keydown", async (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === "Escape") return stopRecording();
  if ((e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.altKey && !e.metaKey) {
    return saveShortcuts(assign(await storedShortcuts(), recording, ""));
  }
  const keys = fromEvent(e);
  if (keys) saveShortcuts(assign(await storedShortcuts(), recording, keys));
}, true);
window.addEventListener("blur", () => { if (recording) stopRecording(); });
document.getElementById("shortcuts-reset").onclick = () => saveShortcuts({});

async function closeSettings() {
  const tab = await chrome.tabs.getCurrent();
  const rest = (await chrome.tabs.query({ windowId: tab.windowId })).filter((t) => t.id !== tab.id);
  if (!rest.length) return chrome.tabs.update(tab.id, { url: "chrome://newtab" });
  const previous = rest.reduce((a, b) => ((b.lastAccessed ?? 0) > (a.lastAccessed ?? 0) ? b : a));
  await chrome.tabs.update(previous.id, { active: true });
  chrome.tabs.remove(tab.id);
}

document.querySelector("#close .k-icon").textContent = glyph("x");
document.getElementById("close").onclick = closeSettings;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.defaultPrevented || (e.target.matches?.("input[type=text], input:not([type])") && e.target.value)) return;
  closeSettings();
});

paintShortcuts();

function engineButton(name, title, pressed, onclick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "engine k-state k-type-label";
  b.textContent = name;
  b.title = title;
  b.setAttribute("aria-pressed", String(pressed));
  b.onclick = onclick;
  return b;
}

async function paintEngines() {
  if (!rangaPrivate) return;
  const engines = await call("getSearchEngines").catch(() => []);
  document.getElementById("engines-setting").hidden = engines.length === 0;
  document.getElementById("private-engines-setting").hidden = engines.length === 0;
  document.getElementById("engines").replaceChildren(...engines.map((engine) => engineButton(engine.name, engine.keyword, engine.isDefault, async () => {
    await call("setDefaultSearchEngine", engine.id).catch(() => {});
    paintEngines();
  })));
  const chosen = engines.some((e) => e.id === settings.privateSearchEngine) ? settings.privateSearchEngine : "";
  const same = async () => { await save("privateSearchEngine", ""); paintEngines(); };
  document.getElementById("private-engines").replaceChildren(
    engineButton("Igual à normal", "Usa o mecanismo de busca padrão", chosen === "", same),
    ...engines.map((engine) => engineButton(engine.name, engine.keyword, chosen === engine.id, async () => {
      await save("privateSearchEngine", engine.id);
      paintEngines();
    })),
  );
}

paintEngines();

const languageDisplay = new Intl.DisplayNames(["pt-BR"], { type: "language" });

function languageNames(codes) {
  return codes.map((code) => { try { return languageDisplay.of(code); } catch { return code; } }).join(", ");
}

function folded(text) {
  return text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{M}/gu, "");
}

for (const el of document.querySelectorAll("[data-icon]")) el.textContent = glyph(el.dataset.icon);

async function openPage(url) {
  const tab = await chrome.tabs.getCurrent();
  chrome.tabs.create({ url, windowId: tab.windowId, index: tab.index + 1, openerTabId: tab.id });
}

for (const row of document.querySelectorAll("[data-open]")) row.onclick = () => openPage(row.dataset.open);

const nav = document.getElementById("nav");
const sections = [...document.querySelectorAll("main > section.card")];
let currentSection = sections[0];

function markNav(id) {
  for (const link of nav.children) link.setAttribute("aria-current", String(link.dataset.target === id));
}

function buildNav() {
  nav.replaceChildren(...sections.filter((s) => !s.hidden).map((section) => {
    const link = document.createElement("a");
    link.className = "nav-item k-state k-type-label";
    link.href = `#${section.id}`;
    link.dataset.target = section.id;
    link.innerHTML = `<span class="k-icon">${glyph(section.dataset.navIcon)}</span>`;
    link.append(section.dataset.title);
    link.onclick = (e) => {
      e.preventDefault();
      history.replaceState(null, "", `#${section.id}`);
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      currentSection = section;
      markNav(section.id);
    };
    return link;
  }));
  markNav(currentSection?.id);
}

const spy = new IntersectionObserver(() => {
  const visible = sections.find((s) => !s.hidden && !s.classList.contains("filtered") && s.getBoundingClientRect().bottom > 120);
  if (!visible) return;
  currentSection = visible;
  markNav(visible.id);
});
for (const section of sections) spy.observe(section);

buildNav();
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });

const search = document.getElementById("search");
search.addEventListener("input", () => {
  const words = folded(search.value.trim()).split(/\s+/).filter(Boolean);
  let found = 0;
  for (const section of sections) {
    const titleMatch = words.length > 0 && words.every((w) => folded(section.dataset.title).includes(w));
    let shown = 0;
    for (const row of section.querySelectorAll(".setting")) {
      const match = !words.length || titleMatch || words.every((w) => folded(row.textContent).includes(w));
      row.classList.toggle("filtered", !match);
      if (match && !row.hidden) shown++;
    }
    section.classList.toggle("filtered", words.length > 0 && shown === 0);
    if (!section.hidden && !section.classList.contains("filtered")) found++;
  }
  document.getElementById("no-results").hidden = found > 0;
});

const zoom = document.getElementById("zoom");

async function paintZoom() {
  if (!chrome.settingsPrivate?.getDefaultZoom) return;
  const value = await chrome.settingsPrivate.getDefaultZoom();
  document.getElementById("zoom-setting").hidden = false;
  for (const option of zoom.querySelectorAll("[data-value]")) option.setAttribute("aria-pressed", String(Math.abs(Number(option.dataset.value) - value) < 0.001));
}

for (const option of zoom.querySelectorAll("[data-value]")) {
  option.addEventListener("click", () => chrome.settingsPrivate.setDefaultZoom(Number(option.dataset.value)).then(paintZoom));
}
paintZoom();

const clearPanel = document.getElementById("clear-panel");
const clearRange = document.getElementById("clear-range");
const clearOpen = document.getElementById("clear-open");
clearOpen.onclick = () => { clearPanel.hidden = !clearPanel.hidden; };
document.getElementById("clear-cancel").onclick = () => { clearPanel.hidden = true; };
for (const option of clearRange.querySelectorAll("[data-value]")) {
  option.addEventListener("click", () => {
    for (const o of clearRange.querySelectorAll("[data-value]")) o.setAttribute("aria-pressed", String(o === option));
  });
}
document.getElementById("clear-run").onclick = async (e) => {
  const span = Number(clearRange.querySelector('[aria-pressed="true"]').dataset.value);
  const kinds = Object.fromEntries([...clearPanel.querySelectorAll("[data-clear]")].map((i) => [i.dataset.clear, i.checked]));
  const siteData = kinds.cookies;
  e.target.disabled = true;
  await chrome.browsingData.remove({ since: span ? Date.now() - span : 0 }, {
    history: kinds.history,
    cookies: siteData,
    localStorage: siteData,
    indexedDB: siteData,
    cacheStorage: siteData,
    serviceWorkers: siteData,
    fileSystems: siteData,
    cache: kinds.cache,
    downloads: kinds.downloads,
    formData: kinds.formData,
  }).catch(() => {});
  e.target.disabled = false;
  clearPanel.hidden = true;
  clearOpen.textContent = "Limpo";
  setTimeout(() => { clearOpen.textContent = "Limpar…"; }, 3000);
};

async function paintProfiles() {
  if (!rangaPrivate) return;
  const { id } = await chrome.windows.getCurrent();
  const enabled = await call("getEnabledCommands", id).catch(() => []);
  document.getElementById("profiles-setting").hidden = !enabled.includes("profiles");
  document.getElementById("profiles").onclick = () => call("executeCommand", id, "profiles").catch(() => {});
  buildNav();
}
paintProfiles();

navigator.userAgentData?.getHighEntropyValues(["fullVersionList"]).then(({ fullVersionList }) => {
  const chromium = fullVersionList?.find((b) => b.brand === "Chromium")?.version;
  document.getElementById("version").textContent = chromium ? `Baseado no Chromium ${chromium}. Abre a página Sobre, com a versão do Ranga.` : "Abre a página Sobre, com a versão do Ranga.";
}).catch(() => {});
