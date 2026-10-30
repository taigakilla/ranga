import { mayHaveKeyword, suggestions, scoped } from "./spotlight-model.js";
import { displayUrl, loadSettings } from "./settings-model.js";
import { loadAliases, parseAlias, findAlias, aliasName, aliasUrl } from "./aliases-model.js";
import { toNavigation } from "./tabs-model.js";
import { glyph } from "./kurobe/icons.mjs";
import { animate, painted } from "./motion.js";
import { available as rangaPrivate, call } from "./ranga-private.js";
import { sessionOf, withSessions } from "./spaces-model.js";

const LOCAL_COMMANDS = ["copyCleanLink", "copyMarkdown"];
const KIND = { command: "Comando", alias: "Atalho" };
const SCOPE_ICON = { tabs: "app-window", bookmarks: "star", history: "history" };
const query = document.getElementById("query");
const results = document.getElementById("results");
const selection = document.getElementById("selection");
const chip = document.getElementById("alias-chip");
const themeStyle = document.getElementById("ranga-theme");
let mode = "new";
let items = [];
let selected = 0;
let target;
let timer;
let commands = [];
let aliases = loadAliases(undefined);
let alias = null;
const suggestCache = new Map();
let privateEngine = "";

function faviconFor(url) {
  const src = new URL(chrome.runtime.getURL("/_favicon/"));
  src.searchParams.set("pageUrl", url);
  src.searchParams.set("size", "32");
  return src.toString();
}

async function close() {
  document.body.classList.add("closed");
  await painted();
  document.title = `ranga-spotlight:close:${Date.now()}`;
}

function selectable(index) {
  return items[index] && items[index].kind !== "header";
}

function step(direction) {
  for (let i = selected + direction; i >= 0 && i < items.length; i += direction) {
    if (selectable(i)) {
      selected = i;
      return;
    }
  }
}

function moveSelection() {
  const row = results.children[selected];
  if (!row) {
    selection.style.opacity = "0";
    return;
  }
  selection.style.opacity = "1";
  selection.style.transform = `translateY(${row.offsetTop - results.scrollTop}px)`;
  selection.style.height = `${row.offsetHeight}px`;
  for (const [i, li] of [...results.children].entries()) li.classList.toggle("result--selected", i === selected);
  row.scrollIntoView({ block: "nearest" });
}

function iconOf(item) {
  if (item.icon) return item.icon;
  if (item.kind === "alias") return item.scope ? SCOPE_ICON[item.scope] : "search";
  return item.kind === "search" || item.kind === "suggestion" || item.kind === "site" ? "search" : "globe";
}

function row(item, index) {
  if (item.kind === "header") return Object.assign(document.createElement("li"), { className: "section k-type-caption", textContent: item.title });
  const li = document.createElement("li");
  li.className = "k-list-item k-state k-type-label result";
  const leading = document.createElement("span");
  leading.className = "k-list-item__leading";
  if (item.url && item.kind !== "site") {
    const img = document.createElement("img");
    img.alt = "";
    img.src = faviconFor(item.url);
    leading.append(img);
  } else {
    leading.innerHTML = `<span class="k-icon">${glyph(iconOf(item))}</span>`;
  }
  const label = document.createElement("span");
  label.className = "k-list-item__label";
  label.textContent = item.title;
  li.append(leading, label);
  if (item.url && item.kind !== "url" && item.kind !== "site") {
    const url = document.createElement("span");
    url.className = "url k-type-caption";
    url.textContent = displayUrl(item.url, true).replace(/^https?:\/\/(www\.)?/, "");
    li.append(url);
  }
  if (KIND[item.kind]) {
    const kind = document.createElement("span");
    kind.className = "kind k-type-caption";
    kind.textContent = KIND[item.kind];
    li.append(kind);
  }
  li.onmousemove = (e) => {
    if (selected === index || (e.movementX === 0 && e.movementY === 0)) return;
    selected = index;
    moveSelection();
  };
  li.onclick = () => run(item);
  return li;
}

function showAlias() {
  chip.hidden = !alias;
  chip.textContent = alias ? aliasName(alias) : "";
  query.parentElement.style.setProperty("--chip-width", alias ? `${chip.offsetWidth + 8}px` : "0px");
  showMode();
}

function setAlias(next) {
  alias = next;
  showAlias();
  if (alias) animate(chip, [{ transform: "scale(0.8)", opacity: 0 }, { transform: "none", opacity: 1 }], "spatial-fast");
}

async function sources(text, incognito) {
  const scope = alias?.scope;
  const wants = (name) => !incognito && (scope ? scope === name : Boolean(text.trim()));
  const [tabs, history, bookmarks] = await Promise.all([
    !scope || scope === "tabs" ? chrome.tabs.query(incognito ? { windowId: target.windowId } : {}) : [],
    wants("history") ? chrome.history.search({ text, maxResults: scope ? 40 : 25, startTime: 0 }) : [],
    wants("bookmarks") ? (text.trim() ? chrome.bookmarks.search(text) : chrome.bookmarks.getRecent(20)) : [],
  ]);
  return { tabs: tabs.filter((t) => t.id !== target?.id && !/^chrome:\/\/newtab\/?$/.test(t.url || "")), history, bookmarks };
}

function suggestionsFor(text) {
  const clean = text.trim();
  if (!rangaPrivate || !target || target.incognito || !clean || toNavigation(clean).kind === "url") return null;
  if (!suggestCache.has(clean)) suggestCache.set(clean, call("getSearchSuggestions", target.windowId, clean).catch(() => []));
  return suggestCache.get(clean);
}

function hintFor(text) {
  const found = !alias && findAlias(aliases, text.trim());
  return found ? { kind: "alias", alias: found.alias, scope: found.scope, title: found.scope ? `Buscar em ${aliasName(found)}` : `Buscar no ${aliasName(found)}` } : null;
}

function paint(next, keep) {
  const key = keep && items[selected] ? JSON.stringify(items[selected]) : null;
  items = next;
  selected = key ? Math.max(0, items.findIndex((i) => JSON.stringify(i) === key)) : 0;
  if (!selectable(selected)) step(1);
  results.replaceChildren(...items.map(row));
  if (!keep) for (const li of results.children) animate(li, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], "effects-default");
  moveSelection();
}

async function refresh() {
  const text = query.value;
  const data = await sources(text, Boolean(target?.incognito));
  if (query.value !== text) return;
  if (alias?.scope) return paint(scoped(alias.scope, text, data));
  if (alias) return paint(text.trim() ? [{ kind: "site", title: `Buscar no ${alias.name}: “${text.trim()}”`, url: aliasUrl(alias, text) }] : []);
  const resolved = mayHaveKeyword(text) || privateEngine ? await resolve(text) : null;
  const base = { ...data, commands, resolved, hint: hintFor(text) };
  paint(suggestions(text, base));
  const pending = suggestionsFor(text);
  const suggested = pending ? await pending : [];
  if (suggested.length && query.value === text && !alias) paint(suggestions(text, { ...base, suggested }), true);
}

function resolve(text) {
  if (!rangaPrivate || !target) return Promise.resolve(null);
  return call("resolveInput", target.windowId, text, ...(privateEngine ? [privateEngine] : [])).catch(() => null);
}

async function createTab(url) {
  const windowId = target?.windowId;
  const { spaces } = await chrome.storage.local.get("spaces");
  const container = rangaPrivate && spaces?.spaces && !target?.incognito ? sessionOf(withSessions({ active: {}, ...spaces }), windowId) : "";
  if (container) return call("createTab", { windowId, container, url, active: true });
  return (await chrome.tabs.create({ url, windowId })).id;
}

async function run(chosen) {
  let item = chosen;
  if (!item) return;
  const newTab = mode === "new";
  if (item.kind === "command") {
    await close();
    if (LOCAL_COMMANDS.includes(item.command)) chrome.runtime.sendMessage({ type: "copy-link", format: item.command, tabId: target?.id }).catch(() => {});
    else await call("executeCommand", target?.windowId, item.command).catch(() => {});
    return;
  }
  if (item.kind === "alias") {
    setAlias(findAlias(aliases, item.alias));
    query.value = "";
    refresh();
    return;
  }
  if (item.kind === "suggestion") return run({ kind: "search", text: item.text });
  if (item.kind === "site") item = { kind: "url", url: item.url };
  if (item.kind === "tab") {
    await chrome.tabs.update(item.tabId, { active: true });
    await chrome.windows.update(item.windowId, { focused: true });
  } else if (item.kind === "search") {
    const url = (await resolve(item.text))?.url;
    if (url && (newTab || !target)) await createTab(url);
    else if (url) await chrome.tabs.update(target.id, { url });
    else if (newTab) await chrome.search.query({ text: item.text, tabId: await createTab("about:blank") });
    else await chrome.search.query({ text: item.text, tabId: target?.id });
  } else if (newTab || !target) {
    await createTab(item.url);
  } else {
    await chrome.tabs.update(target.id, { url: item.url });
  }
  close();
}

function blank(url) {
  return !url || /^chrome:\/\/newtab\/?$/.test(url) || url.startsWith(chrome.runtime.getURL("newtab.html"));
}

function showMode() {
  document.getElementById("field-icon").textContent = glyph(mode === "new" ? "plus" : "search");
  if (alias) {
    query.placeholder = alias.scope ? `Buscar em ${aliasName(alias)}` : `Buscar no ${alias.name}`;
    return;
  }
  const prefix = target?.incognito ? "Anônima: " : mode === "new" ? "Nova aba: " : "";
  query.placeholder = prefix ? `${prefix}buscar ou digitar endereço` : "Buscar ou digitar endereço";
}

async function open() {
  if (location.hash.startsWith("#idle")) return;
  document.title = "Ranga";
  document.body.classList.remove("closed");
  mode = location.hash.startsWith("#current") ? "current" : "new";
  const windowId = Number(location.hash.match(/^#\w+:(\d+)/)?.[1]) || (await chrome.windows.getLastFocused()).id;
  [target] = await chrome.tabs.query({ active: true, windowId });
  const empty = blank(target?.url);
  if (empty) mode = "current";
  commands = rangaPrivate && target ? await call("getEnabledCommands", target.windowId).catch(() => []) : [];
  const stored = await chrome.storage.local.get(["spotlightAliases", "settings"]);
  aliases = loadAliases(stored.spotlightAliases);
  privateEngine = target?.incognito ? loadSettings(stored.settings).privateSearchEngine : "";
  suggestCache.clear();
  alias = null;
  if (/^https?:/.test(target?.url ?? "")) commands = [...commands, ...LOCAL_COMMANDS];
  showAlias();
  query.value = mode === "current" && !empty ? displayUrl(target?.url ?? "", true) : "";
  query.focus();
  query.select();
  for (const el of [document.getElementById("card"), document.getElementById("scrim")]) {
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
  }
  refresh();
}

query.addEventListener("input", () => {
  const parsed = alias ? null : parseAlias(query.value, aliases);
  if (parsed && !(target?.incognito && parsed.alias.scope && parsed.alias.scope !== "tabs")) {
    setAlias(parsed.alias);
    query.value = parsed.rest;
  }
  clearTimeout(timer);
  timer = setTimeout(refresh, 50);
});
query.addEventListener("keydown", (e) => {
  if (e.key === "Backspace" && alias && query.selectionStart === 0 && query.selectionEnd === 0) { e.preventDefault(); setAlias(null); refresh(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); step(1); moveSelection(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); moveSelection(); }
  else if (e.key === "Enter") { e.preventDefault(); run(items[selected]); }
  else if (e.key === "Escape") { e.preventDefault(); close(); }
});
document.getElementById("scrim").onclick = close;
window.addEventListener("hashchange", open);
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  if (document.body.classList.contains("closed") || windowId !== target?.windowId || tabId === target?.id) return;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !blank(tab.pendingUrl || tab.url)) return close();
  target = tab;
  mode = "current";
  showMode();
});

const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => { if (msg.type === "theme") themeStyle.textContent = msg.css; });

open();
