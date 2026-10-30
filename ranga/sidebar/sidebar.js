import { toItems, toNavigation } from "./tabs-model.js";
import { loadSettings, displayUrl } from "./settings-model.js";
import {
  initialState, createSpace, renameSpace, deleteSpace, assignTab, forgetTab,
  visibleTabs, setActive, activeSpace, neighborSpace, rememberTab, updateSpace, snapshot, restore, spaceOfTab, sessionOf, sessionOfSpace, withSessions,
  storeSnapshot, pickSnapshot, forgetSnapshot, reopenedSpace, setTitle,
} from "./spaces-model.js";
import { glyph } from "./kurobe/icons.mjs";
import { createTabList } from "./tab-list.js";
import { showMenu } from "./context-menu.js";
import { setupFavorites } from "./favorites.js";
import { animate, pop, kick, spin } from "./motion.js";
import { toast } from "./toast.js";
import { setupArchive } from "./archive.js";
import { archiveEntry, pushArchive } from "./lifecycle-model.js";
import { setupExtensions } from "./extensions.js";
import { setupContainers } from "./containers.js";
import { setupContainerGroups } from "./container-groups.js";
import { setupContainerEditor } from "./container-editor.js";
import { dropTab, joinWindow } from "./split-drop.js";
import { windowAt, chromeWindowFor, zonesFor, partnerFor } from "./drag-model.js";
import { iconChoices } from "./icons-model.js";
import { setupDownloads } from "./downloads.js";
import { setupPins } from "./pins.js";
import { setupPlayer } from "./player.js";
import { setupPopups } from "./popups.js";
import { available as rangaPrivate, call } from "./ranga-private.js";

const SPACE_COLORS = [null, "#71b1ec", "#7cc2a8", "#d9c08a", "#d49a78", "#d8737a", "#b59ad4"];

const address = document.getElementById("address");
const menu = document.getElementById("menu");
const spaceBar = document.getElementById("spaces");
const spaceTitle = document.getElementById("space-title");
const spaceMenu = document.getElementById("space-menu");
const spaceForm = document.getElementById("space-form");
const themeStyle = document.getElementById("ranga-theme");
const content = document.getElementById("space-content");
let windowId;
let settings = loadSettings();
let spaces = initialState();
let bookmarkTitles = new Map();
let themeCss = "";
let activeUrl = "";
let activeTabId = null;
let menuSpaceId = null;
let lastWheel = 0;
let sidebarMode = "docked";
let incognito = false;
let rightAligned = false;
let leaveTimer;
let ready = false;
let snapshotTimer;
const containers = setupContainers({ windowId: () => windowId });
const pins = setupPins({
  section: document.getElementById("pins"),
  grid: document.getElementById("pins-grid"),
  windowId: () => windowId,
  spaceId: () => activeSpace(spaces, windowId).id,
  assign: (tabId) => moveTabToSpace(tabId, activeSpace(spaces, windowId).id),
  container: () => currentSession(),
  changed: () => render(),
});
const containerEditor = setupContainerEditor({ popover: document.getElementById("containers-popover") });
const groups = setupContainerGroups({
  section: document.getElementById("groups"),
  list: document.getElementById("groups-list"),
  windowId: () => windowId,
  assign: (tabId) => moveTabToSpace(tabId, activeSpace(spaces, windowId).id),
  session: () => currentSession(),
  sessionOfTab: (tabId) => containers.sessionOfTab(tabId),
  changed: () => render(),
  edit: (id) => containerEditor.open(id),
  newTab: (id) => newTabInGroup(id),
  customName: (tabId) => spaces.tabTitle[tabId] || "",
  bookmarkName: (url) => bookmarkTitles.get(url) || "",
});

function keptIds() {
  return new Set([...pins.liveIds(), ...groups.liveIds()]);
}

function paintIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (!el.classList.contains("k-icon") && !el.querySelector(".k-icon")) {
      const icon = document.createElement("span");
      icon.className = "k-icon";
      el.append(icon);
    }
    (el.classList.contains("k-icon") ? el : el.querySelector(".k-icon")).textContent = glyph(el.dataset.icon);
  }
}

async function saveSnapshot() {
  const tabs = await chrome.tabs.query({ windowId });
  if (!ready || incognito) return tabs;
  const { spaceSnapshot } = await chrome.storage.local.get("spaceSnapshot");
  await chrome.storage.local.set({ spaceSnapshot: storeSnapshot(spaceSnapshot, windowId, snapshot(spaces, tabs, windowId)) });
  return tabs;
}

function queueSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(saveSnapshot, 800);
}

async function saveSpaces() {
  const { spaces: list, active, lastTab, tabSpace, tabTitle } = spaces;
  await chrome.storage.local.set({ spaces: { spaces: list, active, lastTab, tabSpace, tabTitle } });
  const tabs = await saveSnapshot();
  await containers.save(tabs);
  await pins.save();
  await groups.persist();
}

function currentSession() {
  return containers.available && !incognito ? sessionOf(spaces, windowId) : "";
}

async function moveTabToSpace(tabId, spaceId) {
  spaces = assignTab(spaces, tabId, spaceId);
  await saveSpaces();
}

async function intoSession(tabId, spaceId) {
  if (!containers.available || incognito) return tabId;
  const session = sessionOfSpace(spaces, spaceId);
  await containers.load();
  if (containers.sessionOfTab(tabId) === session) return tabId;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !/^https?:/.test(tab.url || tab.pendingUrl || "")) return tabId;
  return containers.reopen(tab, session);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, windowId });
  return tab;
}

function groupEntries(ids) {
  if (!containers.available || incognito) return [];
  const save = (groupId) => async () => {
    tabList.clearSelection();
    for (const id of ids) await groups.adopt(id, groupId);
  };
  return [
    "divider",
    { heading: "Guardar no grupo" },
    ...groups.list().map((g) => ({ icon: g.icon, label: g.name, action: save(g.id) })),
    { icon: "plus", label: "Novo grupo", action: () => containerEditor.open() },
  ];
}

function spaceEntries(ids) {
  const current = activeSpace(spaces, windowId).id;
  const others = spaces.spaces.filter((s) => s.id !== current);
  if (!others.length) return [];
  return ["divider", { heading: "Mover para o espaço" }, ...others.map((space) => ({ icon: space.icon, label: space.name, action: () => moveTabsToSpace(ids, space.id) }))];
}

function splitEntries(item) {
  if (item.split) return [{ icon: "panels-left-right", label: "Desfazer divisão", action: () => chrome.tabs.unsplit(item.split) }];
  if (item.active || !chrome.tabs.createSplit) return [];
  return [{
    icon: "columns-2",
    label: "Dividir tela com a aba atual",
    action: async () => {
      const current = await activeTab();
      if (!current || current.splitViewId > 0 || current.pinned !== item.pinned) return;
      const tab = await chrome.tabs.get(item.id);
      const index = tab.index < current.index ? current.index : current.index + 1;
      await chrome.tabs.move(item.id, { index });
      await chrome.tabs.createSplit([current.id, item.id]).catch(() => toast("Não deu pra dividir essas abas"));
    },
  }];
}

async function tabsMenu(ids, x, y) {
  const tabs = (await Promise.all(ids.map((id) => chrome.tabs.get(id).catch(() => null)))).filter(Boolean);
  showMenu([
    { heading: `${tabs.length} abas selecionadas` },
    { icon: "pin", label: "Fixar", action: async () => { tabList.clearSelection(); for (const t of tabs) await pins.pinTab(t); } },
    {
      icon: "external-link",
      label: "Destacar em janela",
      action: async () => {
        tabList.clearSelection();
        const win = await chrome.windows.create({ tabId: tabs[0].id });
        if (tabs.length > 1) await chrome.tabs.move(tabs.slice(1).map((t) => t.id), { windowId: win.id, index: -1 });
      },
    },
    { icon: "copy", label: "Duplicar", action: () => { tabList.clearSelection(); for (const t of tabs) chrome.tabs.duplicate(t.id); } },
    { icon: "link", label: "Copiar links", action: () => navigator.clipboard.writeText(tabs.map((t) => t.url).join("\n")) },
    { icon: "rotate-cw", label: "Recarregar", action: () => { for (const t of tabs) chrome.tabs.reload(t.id); } },
    { icon: "moon", label: "Dormir", action: () => { tabList.clearSelection(); for (const t of tabs) if (!t.active && !t.discarded) chrome.tabs.discard(t.id).catch(() => {}); } },
    ...groupEntries(ids),
    ...spaceEntries(ids),
    "divider",
    { icon: "x", label: `Fechar ${tabs.length} abas`, danger: true, action: () => closeTabs(ids) },
  ], x, y);
}

function tabMenu(item, x, y, selection) {
  if (selection?.length > 1) return tabsMenu(selection, x, y);
  showMenu([
    { icon: "pin", label: "Fixar", action: async () => pins.pinTab(await chrome.tabs.get(item.id)) },
    { icon: "external-link", label: "Destacar em janela", action: () => chrome.windows.create({ tabId: item.id }) },
    ...splitEntries(item),
    { icon: "pencil", label: "Renomear", action: () => tabList.rename(item.id) },
    { icon: "copy", label: "Duplicar", action: () => chrome.tabs.duplicate(item.id) },
    { icon: "link", label: "Copiar link", action: () => navigator.clipboard.writeText(item.url) },
    { icon: "rotate-cw", label: "Recarregar", action: () => chrome.tabs.reload(item.id) },
    ...(item.active || item.asleep ? [] : [{ icon: "moon", label: "Dormir", action: () => chrome.tabs.discard(item.id).catch(() => {}) }]),
    ...(item.audio === "muted" ? [{ icon: "volume-2", label: "Ativar som", action: () => chrome.tabs.update(item.id, { muted: false }) }] : []),
    ...(item.audio === "playing" ? [{ icon: "volume-x", label: "Silenciar", action: () => chrome.tabs.update(item.id, { muted: true }) }] : []),
    ...groupEntries([item.id]),
    ...spaceEntries([item.id]),
    "divider",
    { icon: "copy-x", label: "Fechar as outras", action: () => closeAround(item.id, (i, at) => i !== at) },
    { icon: "arrow-down-to-line", label: "Fechar as de baixo", action: () => closeAround(item.id, (i, at) => i > at) },
    { icon: "x", label: "Fechar", danger: true, action: () => chrome.tabs.remove(item.id) },
  ], x, y);
}

async function closeTabs(ids) {
  if (!ids.length) return;
  tabList.clearSelection();
  await chrome.tabs.remove(ids);
  toast(ids.length === 1 ? "1 aba fechada" : `${ids.length} abas fechadas`, { label: "Desfazer", run: () => restoreClosed(ids.length) });
}

async function closeAround(tabId, pick) {
  const kept = keptIds();
  const today = visibleTabs(spaces, await chrome.tabs.query({ windowId }), windowId)
    .filter((t) => !kept.has(t.id) && !t.pinned)
    .sort((a, b) => a.index - b.index);
  const at = today.findIndex((t) => t.id === tabId);
  if (at < 0) return;
  await closeTabs(today.filter((_, i) => pick(i, at)).map((t) => t.id));
}

async function moveTabsToSpace(ids, spaceId) {
  tabList.clearSelection();
  const current = activeSpace(spaces, windowId).id;
  for (const id of ids) spaces = assignTab(spaces, await intoSession(id, spaceId), spaceId);
  await saveSpaces();
  const active = await activeTab();
  if (active && spaceOfTab(spaces, active.id, windowId) !== current) {
    const rest = visibleTabs(spaces, await chrome.tabs.query({ windowId }), windowId);
    if (rest.length) await chrome.tabs.update(rest[0].id, { active: true });
    else await chrome.tabs.create({ windowId });
  }
  render();
}

async function restoreClosed(count) {
  for (let i = 0; i < count; i++) await chrome.sessions.restore().catch(() => {});
}

async function loadBookmarkTitles() {
  const titles = new Map();
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.url && node.title && !titles.has(node.url)) titles.set(node.url, node.title);
      if (node.children) walk(node.children);
    }
  };
  walk(await chrome.bookmarks.getTree());
  bookmarkTitles = titles;
  render();
}

for (const ev of ["onCreated", "onChanged", "onRemoved", "onMoved", "onImportEnded"]) chrome.bookmarks[ev]?.addListener(loadBookmarkTitles);
loadBookmarkTitles();

async function renameTab(id, title) {
  const tab = await chrome.tabs.get(id).catch(() => null);
  if (!tab) return;
  const marks = spaces.tabTitle[id] ? [] : await chrome.bookmarks.search({ url: tab.url }).catch(() => []);
  if (marks.length) {
    for (const mark of marks) await chrome.bookmarks.update(mark.id, { title: title.trim() || tab.title || tab.url });
  } else {
    spaces = setTitle(spaces, id, title);
    await saveSpaces();
  }
  render();
}

function setupPageDrop() {
  let drag = null;
  let frame = 0;
  let asked = 0;
  let listening = false;
  const answers = new Map();

  function pointer() {
    if (!listening) {
      listening = true;
      themePort.onMessage.addListener((msg) => {
        if (msg.type !== "pointer") return;
        answers.get(msg.id)?.(msg.pointer);
        answers.delete(msg.id);
      });
    }
    const id = ++asked;
    return new Promise((resolve) => {
      answers.set(id, resolve);
      themePort.postMessage({ type: "pointer", id });
      setTimeout(() => { if (answers.delete(id)) resolve(null); }, 250);
    });
  }

  async function start(id) {
    const [dragged, all] = await Promise.all([
      chrome.tabs.get(id).catch(() => null),
      chrome.windows.getAll({ populate: true, windowTypes: ["normal"] }),
    ]);
    const windows = all.filter((w) => w.incognito === incognito).map((w) => {
      const active = w.tabs.find((t) => t.active) ?? null;
      const own = w.id === windowId && dragged ? partnerFor(dragged, visibleTabs(spaces, w.tabs, windowId)) : null;
      return { id: w.id, title: active?.title ?? "", active, own };
    });
    return { id, dragged, windows, target: null, zone: "", zones: "" };
  }

  async function locate(x, y) {
    const found = drag.windows.length > 1 ? await pointer() : null;
    const over = found && windowAt(found, found.windows);
    if (found && !over) return null;
    const other = over && chromeWindowFor(over, drag.windows);
    if (other && other.id !== windowId) return { window: other.id, x: found.x - over.x, y: found.y - over.y, partner: other.active };
    return { window: windowId, x, y, partner: drag.windows.find((w) => w.id === windowId)?.own ?? null };
  }

  async function update(x, y) {
    const spot = await locate(x, y);
    if (!drag) return;
    if (drag.target && drag.target !== spot?.window) call("endTabDrag", drag.target).catch(() => {});
    if (!spot) {
      drag.target = null;
      drag.zone = "";
      return;
    }
    const own = spot.window === windowId;
    const zones = zonesFor({ dragged: drag.dragged, partner: spot.partner, own });
    if (drag.target !== spot.window || drag.zones !== zones) {
      const pairs = zones.includes("left") && spot.partner;
      chrome.storage.session.set({ tabDrag: { tab: drag.id, partner: pairs ? spot.partner.id : null } });
    }
    drag.target = spot.window;
    drag.zones = zones;
    drag.partner = spot.partner;
    drag.zone = await call("dragTab", spot.window, Math.round(spot.x), Math.round(spot.y), zones).catch(() => "");
  }

  function hide() {
    if (drag?.target) call("endTabDrag", drag.target).catch(() => {});
    call("endTabDrag", windowId).catch(() => {});
    chrome.storage.session.remove("tabDrag");
  }

  return {
    over(id, x, y) {
      drag ||= { pending: start(id), point: null };
      drag.point = [x, y];
      frame ||= requestAnimationFrame(async () => {
        if (drag?.pending) Object.assign(drag, await drag.pending, { pending: null });
        frame = 0;
        if (drag?.point) await update(...drag.point);
      });
    },
    leave() {
      if (!drag) return;
      hide();
      drag.point = null;
      drag.target = null;
      drag.zone = "";
    },
    async drop(id, at) {
      cancelAnimationFrame(frame);
      frame = 0;
      if (!drag) return;
      if (drag.pending) Object.assign(drag, await drag.pending, { pending: null });
      const end = at ?? drag.point;
      if (end) await update(...end);
      const { zone, target, partner, dragged } = drag;
      hide();
      drag = null;
      if (!zone || !target) return;
      if (target === windowId) await dropTab(windowId, id, zone, dragged?.splitViewId > 0 ? dragged.splitViewId : null, partner?.id ?? null);
      else await joinWindow(target, id, zone, partner?.id ?? null);
    },
  };
}

const tabList = createTabList({
  list: document.getElementById("tabs"),
  indicator: document.getElementById("active-indicator"),
  onActivate: (id) => chrome.tabs.update(id, { active: true }),
  onClose: (id) => chrome.tabs.remove(id),
  onMute: (id, muted) => chrome.tabs.update(id, { muted }),
  onRename: renameTab,
  onContextMenu: tabMenu,
  dropZone: {
    over: (x, y) => pins.contains(x, y),
    drop: async (id) => pins.pinTab(await chrome.tabs.get(id)),
  },
  pageDrop: rangaPrivate ? setupPageDrop() : null,
  onMove: async (id, target) => {
    const { index } = await chrome.tabs.get(target.id);
    await chrome.tabs.move(id, { index });
  },
});

function showAddress() {
  if (document.activeElement === address) return;
  address.value = displayUrl(activeUrl, settings.showFullUrl);
  document.querySelector("#address-icon .k-icon").textContent = glyph(activeUrl.startsWith("https://") ? "lock" : "globe");
}

const zoomChip = document.getElementById("zoom");

async function showZoom() {
  if (activeTabId === null) return;
  const tabId = activeTabId;
  const [zoom, { defaultZoomFactor = 1 }] = await Promise.all([
    chrome.tabs.getZoom(tabId),
    chrome.tabs.getZoomSettings(tabId),
  ]).catch(() => [1, {}]);
  if (tabId !== activeTabId) return;
  zoomChip.hidden = Math.abs(zoom - defaultZoomFactor) < 0.001;
  zoomChip.textContent = `${Math.round(zoom * 100)}%`;
}

zoomChip.addEventListener("click", () => chrome.tabs.setZoom(activeTabId, 0).catch(() => {}));
chrome.tabs.onZoomChange.addListener(({ tabId }) => {
  if (tabId === activeTabId) showZoom();
});

function applySpaceColor() {
  const space = activeSpace(spaces, windowId);
  for (const role of ["primary", "secondary"]) {
    if (space.color) document.body.style.setProperty(`--k-color-${role}`, space.color);
    else document.body.style.removeProperty(`--k-color-${role}`);
  }
}

function renderSpaces() {
  const current = activeSpace(spaces, windowId);
  spaceTitle.querySelector(".k-icon").textContent = glyph(incognito ? "venetian-mask" : current.icon);
  spaceTitle.querySelector(".name").textContent = incognito ? `${current.name} · anônima` : current.name;
  const buttons = spaces.spaces.map((space) => {
    const button = document.createElement("button");
    button.className = "space k-state" + (space.id === current.id ? " space--active" : "");
    button.title = space.name;
    button.dataset.icon = space.icon;
    if (space.color) button.style.setProperty("--space-color", space.color);
    button.onclick = () => switchSpace(space.id, Math.sign(spaces.spaces.indexOf(space) - spaces.spaces.indexOf(current)));
    button.oncontextmenu = (e) => { e.preventDefault(); openSpaceMenu(space.id, button); };
    return button;
  });
  const add = document.createElement("button");
  add.className = "space space--add k-state";
  add.title = "Novo espaço";
  add.dataset.icon = "plus";
  add.onclick = (e) => { e.stopPropagation(); openSpaceForm(); };
  spaceBar.replaceChildren(...buttons, add);
  paintIcons(spaceBar);
  applySpaceColor();
}

let renderQueued = null;

function render() {
  renderQueued ??= new Promise((resolve) => setTimeout(async () => {
    renderQueued = null;
    await paint();
    resolve();
  }, 16));
  return renderQueued;
}

async function paint() {
  const all = await chrome.tabs.query({});
  const tabs = all.filter((t) => t.windowId === windowId);
  await containers.load();
  const kept = keptIds();
  const visible = visibleTabs(spaces, tabs, windowId).filter((t) => !kept.has(t.id));
  const active = tabs.find((t) => t.active);
  const items = toItems(visible, active?.id, (t) => spaces.tabTitle[t.id] || bookmarkTitles.get(t.url) || "");
  pins.render(new Map(all.map((t) => [t.id, t])), active?.id);
  if (incognito) document.getElementById("groups").hidden = true;
  else groups.render(new Map(all.map((t) => [t.id, t])), active?.id);
  tabList.render(items.filter((i) => !i.pinned));
  activeUrl = active?.url || active?.pendingUrl || "";
  activeTabId = active?.id ?? null;
  showAddress();
  showZoom();
  renderSpaces();
  extensions.refresh();
}

async function switchSpace(spaceId, direction = 0) {
  const current = activeSpace(spaces, windowId).id;
  if (spaceId === current) return;
  const active = await activeTab();
  if (active) spaces = rememberTab(spaces, current, active.id);
  spaces = setActive(spaces, windowId, spaceId);
  await saveSpaces();
  const tabs = await chrome.tabs.query({ windowId });
  const visible = visibleTabs(spaces, tabs, windowId);
  const target = visible.find((t) => t.id === spaces.lastTab[spaceId]) ?? visible[0];
  if (target) await chrome.tabs.update(target.id, { active: true });
  else await chrome.tabs.create({ windowId });
  if (direction) animate(content, [{ opacity: 0, transform: `translateX(${direction * 36}px)` }, { opacity: 1, transform: "none" }], "spatial-default");
  render();
}

function openSpaceMenu(spaceId, anchor) {
  menuSpaceId = spaceId;
  const rect = anchor.getBoundingClientRect();
  spaceMenu.style.left = `${Math.max(8, rect.left)}px`;
  spaceMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  spaceMenu.hidden = false;
}

function openSpaceForm(space = null) {
  spaceForm.dataset.editing = space?.id ?? "";
  spaceForm.querySelector("input[name=name]").value = space?.name ?? "";
  const icons = spaceForm.querySelector(".icons");
  const current = space?.icon ?? "house";
  icons.replaceChildren(...iconChoices(current).map((name) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "choice k-state";
    b.dataset.icon = name;
    b.dataset.value = name;
    b.setAttribute("aria-pressed", String(name === current));
    b.onclick = () => { for (const x of icons.children) x.setAttribute("aria-pressed", String(x === b)); pop(b); };
    return b;
  }));
  const colors = spaceForm.querySelector(".colors");
  colors.replaceChildren(...SPACE_COLORS.map((color) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch k-state" + (color ? "" : " swatch--theme");
    b.title = color ? color : "Cor do tema do Ciel";
    if (color) b.style.background = color;
    b.dataset.value = color ?? "";
    b.setAttribute("aria-pressed", String(color === (space?.color ?? null)));
    b.onclick = () => { for (const x of colors.children) x.setAttribute("aria-pressed", String(x === b)); pop(b); };
    return b;
  }));
  const session = spaceForm.querySelector(".space-session");
  const own = !space || Boolean(space.session);
  session.hidden = !containers.available || incognito;
  session.querySelector(".space-session__text").textContent = own ? "Sessão própria: logins e cookies separados dos outros espaços." : "Sessão principal do navegador.";
  const clear = document.getElementById("space-clear");
  clear.hidden = !space?.session;
  clear.disabled = false;
  clear.textContent = "Limpar dados";
  clear.onclick = async () => {
    clear.disabled = true;
    await call("clearContainer", space.session).catch(() => {});
    clear.textContent = "Dados limpos";
  };
  paintIcons(spaceForm);
  spaceForm.hidden = false;
  spaceForm.querySelector("input[name=name]").focus();
}

spaceForm.addEventListener("click", (e) => e.stopPropagation());
spaceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = spaceForm.querySelector("input[name=name]").value;
  const icon = spaceForm.querySelector(".icons [aria-pressed=true]")?.dataset.value;
  const color = spaceForm.querySelector(".colors [aria-pressed=true]")?.dataset.value || null;
  try {
    const editing = spaceForm.dataset.editing;
    if (editing) {
      spaces = renameSpace(spaces, editing, name);
      spaces = updateSpace(spaces, editing, { icon, color });
      await saveSpaces();
      render();
    } else {
      spaces = createSpace(spaces, { name, icon, color });
      await saveSpaces();
      await switchSpace(spaces.spaces.at(-1).id, 1);
    }
    spaceForm.hidden = true;
  } catch {
    spaceForm.querySelector("input[name=name]").focus();
  }
});
document.getElementById("space-cancel").onclick = () => { spaceForm.hidden = true; };

for (const item of spaceMenu.querySelectorAll("[data-space-action]")) {
  item.onclick = async () => {
    spaceMenu.hidden = true;
    const space = spaces.spaces.find((s) => s.id === menuSpaceId);
    if (!space) return;
    if (item.dataset.spaceAction === "edit") openSpaceForm(space);
    if (item.dataset.spaceAction === "delete" && spaces.spaces.length > 1) {
      const moving = Object.entries(spaces.tabSpace).filter(([, id]) => id === space.id).map(([id]) => Number(id));
      spaces = deleteSpace(spaces, space.id);
      const fallback = spaces.spaces[0].id;
      for (const id of moving) spaces = assignTab(spaces, await intoSession(id, fallback), fallback);
      await saveSpaces();
      render();
    }
  };
}

address.addEventListener("focus", () => { address.value = displayUrl(activeUrl, true); address.select(); });
address.addEventListener("blur", showAddress);
address.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") { address.blur(); return; }
  if (e.key !== "Enter") return;
  const nav = toNavigation(address.value);
  const tab = await activeTab();
  const engine = incognito ? settings.privateSearchEngine : "";
  const resolved = nav.kind === "search" && rangaPrivate ? await call("resolveInput", windowId, nav.text, ...(engine ? [engine] : [])).catch(() => null) : null;
  if (nav.kind === "url") chrome.tabs.update(tab.id, { url: nav.url });
  else if (resolved) chrome.tabs.update(tab.id, { url: resolved.url });
  else chrome.search.query({ text: nav.text, tabId: tab.id });
  address.blur();
});

document.getElementById("address-icon").onclick = () => {
  if (rangaPrivate) call("showPageInfo", windowId).catch(() => {});
};
const iconOf = (id) => document.querySelector(`#${id} .k-icon`);
document.getElementById("back").onclick = async () => { kick(iconOf("back"), "translateX(-7px)"); chrome.tabs.goBack((await activeTab()).id); };
document.getElementById("forward").onclick = async () => { kick(iconOf("forward"), "translateX(7px)"); chrome.tabs.goForward((await activeTab()).id); };
document.getElementById("reload").onclick = async () => { spin(iconOf("reload")); chrome.tabs.reload((await activeTab()).id); };
document.getElementById("new-tab").onclick = () => {
  if (rangaPrivate) call("executeCommand", windowId, "newTab").catch(() => chrome.tabs.create({ windowId }));
  else chrome.tabs.create({ windowId });
};

let groupTab = null;

async function blankTab(spaceId, active) {
  const session = containers.available && !incognito ? sessionOfSpace(spaces, spaceId) : "";
  return session ? containers.open({ container: session, active }) : (await chrome.tabs.create({ windowId, active })).id;
}

async function newTabInGroup(groupId) {
  const id = await blankTab(activeSpace(spaces, windowId).id, true);
  groupTab = { id, groupId };
  if (rangaPrivate) call("executeCommand", windowId, "openLocation").catch(() => {});
}

async function newTabInSpace(spaceId) {
  const from = spaces.spaces.findIndex((s) => s.id === activeSpace(spaces, windowId).id);
  const to = spaces.spaces.findIndex((s) => s.id === spaceId);
  const id = await blankTab(spaceId, false);
  spaces = rememberTab(assignTab(spaces, id, spaceId), spaceId, id);
  await switchSpace(spaceId, Math.sign(to - from));
  if (rangaPrivate) call("executeCommand", windowId, "openLocation").catch(() => {});
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (groupTab?.id !== tabId || !/^https?:/.test(info.url ?? "")) return;
  const { groupId } = groupTab;
  groupTab = null;
  groups.adopt(tabId, groupId);
});
chrome.tabs.onRemoved.addListener((tabId) => { if (groupTab?.id === tabId) groupTab = null; });

document.getElementById("new-tab").oncontextmenu = (e) => {
  e.preventDefault();
  const others = spaces.spaces.filter((s) => s.id !== activeSpace(spaces, windowId).id);
  if (!others.length || incognito) return;
  showMenu([
    { heading: "Nova aba no espaço" },
    ...others.map((space) => ({ icon: space.icon, label: space.name, action: () => newTabInSpace(space.id) })),
  ], e.clientX, e.clientY);
};
async function reopen(entries) {
  for (const entry of entries) {
    const space = spaces.spaces.some((s) => s.id === entry.space) ? entry.space : activeSpace(spaces, windowId).id;
    const session = containers.available && !incognito ? sessionOfSpace(spaces, space) : "";
    const id = session ? await containers.open({ url: entry.url, container: session, active: false }) : (await chrome.tabs.create({ url: entry.url, windowId, active: false })).id;
    await moveTabToSpace(id, space);
  }
  render();
}

async function archiveTabs(tabs, reason) {
  const now = Date.now();
  const entries = tabs.filter((t) => /^https?:\/\//.test(t.url || "")).map((t) => archiveEntry(t, spaceOfTab(spaces, t.id, windowId), now));
  const { archive } = await chrome.storage.local.get("archive");
  await chrome.storage.local.set({ archive: pushArchive(archive, entries), lastArchived: { at: now, reason, windowId, entries } });
  await chrome.tabs.remove(tabs.map((t) => t.id));
}

async function clearableTabs() {
  const kept = keptIds();
  return visibleTabs(spaces, await chrome.tabs.query({ windowId, pinned: false, active: false }), windowId).filter((t) => !kept.has(t.id));
}

async function clearToday() {
  const tabs = await clearableTabs();
  if (tabs.length) archiveTabs(tabs, "clear");
}

const clearButton = document.getElementById("clear-today");
let clearArmed = 0;

function disarmClear() {
  clearTimeout(clearArmed);
  clearArmed = 0;
  clearButton.classList.remove("clear--armed");
  clearButton.lastChild.textContent = "Limpar";
  clearButton.querySelector(".k-icon").textContent = glyph("arrow-down");
}

clearButton.onclick = async () => {
  if (clearArmed) {
    disarmClear();
    return clearToday();
  }
  const count = (await clearableTabs()).length;
  if (!count) return;
  clearButton.classList.add("clear--armed");
  clearButton.lastChild.textContent = count === 1 ? "Fechar 1 aba?" : `Fechar ${count} abas?`;
  clearButton.querySelector(".k-icon").textContent = glyph("x");
  pop(clearButton);
  clearArmed = setTimeout(disarmClear, 3000);
};
clearButton.onmouseleave = () => { if (clearArmed) disarmClear(); };

const archivePanel = setupArchive({ popover: document.getElementById("archive-popover"), reopen });

function announceArchived(info) {
  const count = info.entries.length;
  if (!count || (info.windowId && info.windowId !== windowId)) return;
  toast(count === 1 ? "1 aba arquivada" : `${count} abas arquivadas`, {
    label: "Desfazer",
    run: async () => {
      await reopen(info.entries);
      const { archive = [] } = await chrome.storage.local.get("archive");
      const urls = new Set(info.entries.map((e) => `${e.url}|${e.archivedAt}`));
      await chrome.storage.local.set({ archive: archive.filter((e) => !urls.has(`${e.url}|${e.archivedAt}`)) });
    },
  });
}

document.getElementById("menu-button").onclick = async (e) => {
  e.stopPropagation();
  if (menu.hidden) kick(iconOf("menu-button"), "rotate(90deg)");
  menu.hidden = !menu.hidden;
  if (menu.hidden || !rangaPrivate) return;
  const enabled = await call("getEnabledCommands", windowId).catch(() => []);
  menu.querySelector("[data-action=ranga-install-pwa]").hidden = !enabled.includes("installPwa");
  menu.querySelector("[data-action=ranga-profiles]").hidden = !enabled.includes("profiles");
};
document.addEventListener("click", () => { menu.hidden = true; spaceMenu.hidden = true; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { menu.hidden = true; spaceMenu.hidden = true; spaceForm.hidden = true; } });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") tabList.clearSelection();
  else if (e.key === "Delete" && tabList.selection().length > 1 && !e.target.closest?.("input, textarea")) closeTabs(tabList.selection());
});
for (const item of menu.querySelectorAll("[data-action]")) {
  item.onclick = () => {
    menu.hidden = true;
    const action = item.dataset.action;
    if (action === "ranga-settings") chrome.runtime.openOptionsPage();
    else if (action === "ranga-archive") archivePanel.open();
    else if (action === "ranga-toggle-sidebar") toggleSidebar();
    else if (action === "ranga-install-pwa") call("executeCommand", windowId, "installPwa").catch(() => {});
    else if (action === "ranga-new-window") chrome.windows.create({});
    else if (action === "ranga-new-incognito") chrome.windows.create({ incognito: true });
    else if (action === "ranga-profiles") call("executeCommand", windowId, "profiles").catch(() => {});
    else chrome.tabs.create({ url: action, windowId });
  };
}

const extensions = setupExtensions({
  bar: document.getElementById("extensions"),
  button: document.getElementById("extensions-button"),
  popover: document.getElementById("extensions-popover"),
  windowId: () => windowId,
});

setupPopups();

const player = setupPlayer({
  root: document.getElementById("player"),
  windowId: () => windowId,
  enabled: () => settings.miniPlayer,
});

setupDownloads({
  button: document.getElementById("downloads-button"),
  popover: document.getElementById("downloads-popover"),
  windowId: () => windowId,
});

setupFavorites({
  button: document.getElementById("favorites-button"),
  popover: document.getElementById("favorites-popover"),
  activeTab,
  windowId: () => windowId,
  openTab: (url, active) => (currentSession() ? containers.open({ url, container: currentSession(), active }) : chrome.tabs.create({ url, windowId, active })),
});

document.addEventListener("wheel", (e) => {
  const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
  if (!sideways || Date.now() - lastWheel < 350) return;
  lastWheel = Date.now();
  const direction = sideways > 0 ? 1 : -1;
  switchSpace(neighborSpace(spaces, activeSpace(spaces, windowId).id, direction), direction);
}, { passive: true });

chrome.tabs.onCreated.addListener(async (tab) => {
  if (ready && tab.windowId === windowId && !spaces.tabSpace[tab.id]) await moveTabToSpace(tab.id, activeSpace(spaces, windowId).id);
  render();
});
chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  if (!ready) return;
  spaces = forgetTab(spaces, tabId);
  if (info.windowId === windowId && !info.isWindowClosing) await saveSpaces();
  render();
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.windowId === windowId && info.url) queueSnapshot();
});
chrome.tabs.onMoved.addListener((tabId, info) => {
  if (info.windowId === windowId) queueSnapshot();
});
chrome.tabs.onActivated.addListener(async ({ tabId, windowId: w }) => {
  if (ready && w === windowId) {
    const space = spaceOfTab(spaces, tabId, windowId);
    if (space !== activeSpace(spaces, windowId).id) {
      spaces = setActive(spaces, windowId, space);
      await saveSpaces();
    }
  }
  render();
});
for (const ev of ["onUpdated", "onMoved", "onAttached", "onDetached"]) chrome.tabs[ev].addListener(() => render());

async function restoreCrashedSession() {
  if (!rangaPrivate || !(await call("getCrashedSession", windowId).catch(() => false))) return;
  call("resolveCrashedSession", windowId, true).catch(() => {});
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "session-crashed") restoreCrashedSession();
});

async function setSidebarMode(mode) {
  if (!rangaPrivate) return;
  await call("setSidebarMode", windowId, mode).catch(() => {});
}

function paintSidebarMode(mode) {
  sidebarMode = mode;
  document.body.classList.toggle("collapsed", mode === "collapsed");
  const label = menu.querySelector(".toggle-sidebar-label");
  label.textContent = mode === "docked" ? "Recolher barra lateral" : "Fixar barra lateral";
  label.previousElementSibling.textContent = glyph(mode === "docked" ? "panel-left-close" : "panel-left-open");
}

async function rememberSidebar() {
  await chrome.storage.local.set({ sidebarCollapsed: sidebarMode === "collapsed" });
}

async function toggleSidebar() {
  const collapse = sidebarMode === "docked";
  await chrome.storage.local.set({ sidebarCollapsed: collapse });
  await setSidebarMode(collapse ? "collapsed" : "docked");
}

chrome.settingsPrivate?.getPref("side_panel.is_right_aligned").then((pref) => { rightAligned = Boolean(pref?.value); }).catch(() => {});
chrome.settingsPrivate?.onPrefsChanged.addListener((prefs) => {
  const pref = prefs.find((p) => p.key === "side_panel.is_right_aligned");
  if (pref) rightAligned = Boolean(pref.value);
});
chrome.rangaPrivate?.onSidebarModeChanged?.addListener((mode, w) => {
  if (w === windowId) paintSidebarMode(mode);
});
document.documentElement.addEventListener("mouseleave", (e) => {
  if (sidebarMode !== "floating" || (rightAligned ? e.clientX >= innerWidth - 8 : e.clientX <= 8)) return;
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { if (sidebarMode === "floating") setSidebarMode("collapsed"); }, 350);
});
document.documentElement.addEventListener("mouseenter", () => {
  clearTimeout(leaveTimer);
  if (sidebarMode === "collapsed") setSidebarMode("floating");
});

async function splitWithPrevious() {
  const tabs = await chrome.tabs.query({ windowId });
  const current = tabs.find((t) => t.active);
  if (!current || !chrome.tabs.createSplit) return;
  if (current.splitViewId > 0) {
    await chrome.tabs.unsplit(current.splitViewId);
    return;
  }
  const visible = new Set(visibleTabs(spaces, tabs, windowId).map((t) => t.id));
  const [previous] = tabs
    .filter((t) => t.id !== current.id && visible.has(t.id) && t.pinned === current.pinned && !(t.splitViewId > 0))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  if (!previous) return;
  await chrome.tabs.move(previous.id, { index: previous.index < current.index ? current.index : current.index + 1 });
  await chrome.tabs.createSplit([current.id, previous.id]).catch(() => toast("Não deu pra dividir essas abas"));
}

const SHORTCUT_ACTIONS = {
  newTab: () => call("executeCommand", windowId, "newTab"),
  openLocation: () => call("executeCommand", windowId, "openLocation"),
  copyUrl: async () => chrome.runtime.sendMessage({ type: "copy-link", format: "copyUrl", tabId: (await activeTab())?.id }),
  copyMarkdown: async () => chrome.runtime.sendMessage({ type: "copy-link", format: "copyMarkdown", tabId: (await activeTab())?.id }),
  pinTab: async () => pins.toggleTab(await activeTab()),
  splitView: splitWithPrevious,
  toggleSidebar: rememberSidebar,
  spaceNext: () => switchSpace(neighborSpace(spaces, activeSpace(spaces, windowId).id, 1), 1),
  spacePrevious: () => switchSpace(neighborSpace(spaces, activeSpace(spaces, windowId).id, -1), -1),
  clearToday,
  archive: () => archivePanel.open(),
  settings: () => chrome.runtime.openOptionsPage(),
};

chrome.rangaPrivate?.onShortcut?.addListener((command, w) => {
  if (w === windowId) SHORTCUT_ACTIONS[command]?.()?.catch?.(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) {
    settings = loadSettings(changes.settings.newValue);
    applySettings();
    player.refresh();
  }
  if (changes.lastArchived?.newValue) announceArchived(changes.lastArchived.newValue);
  if (changes.containers) render();
  if (changes.spaces?.newValue) {
    const saved = changes.spaces.newValue;
    spaces = {
      ...spaces,
      spaces: saved.spaces,
      active: { ...saved.active, [windowId]: spaces.active[windowId] ?? saved.active[windowId] },
      lastTab: saved.lastTab,
      tabSpace: { ...saved.tabSpace, ...spaces.tabSpace },
    };
    render();
  }
});

function applySettings() {
  document.body.classList.toggle("compact", settings.density === "compact");
  themeStyle.textContent = settings.followCielTheme ? themeCss : "";
  render();
}

const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => {
  if (msg.type === "build") {
    const card = document.getElementById("update");
    if (msg.updateReady && card.hidden) {
      card.hidden = false;
      pop(card);
    }
    return;
  }
  if (msg.type !== "theme") return;
  themeCss = msg.css;
  if (settings.followCielTheme) themeStyle.textContent = themeCss;
});
const askBuild = () => themePort.postMessage({ type: "build" });
askBuild();
setInterval(askBuild, 10 * 60 * 1000);
window.addEventListener("focus", askBuild);
document.getElementById("update-restart").onclick = () => call("executeCommand", windowId, "restart").catch(() => {});

if (!(await chrome.alarms.get("ranga-lifecycle"))) chrome.alarms.create("ranga-lifecycle", { periodInMinutes: 1 });
paintIcons();
const currentWindow = await chrome.windows.getCurrent();
windowId = currentWindow.id;
incognito = currentWindow.incognito;
document.body.classList.toggle("incognito", incognito);
settings = loadSettings((await chrome.storage.local.get("settings")).settings);
const stored = await chrome.storage.local.get(["spaces", "spaceSnapshot"]);
if (stored.spaces?.spaces?.length) spaces = withSessions({ ...initialState(), ...stored.spaces, tabSpace: stored.spaces.tabSpace ?? {}, tabTitle: stored.spaces.tabTitle ?? {} });
const windowTabs = await chrome.tabs.query({ windowId });
const liveTabs = new Set((await chrome.tabs.query({})).map((t) => String(t.id)));
const liveWindows = new Set((await chrome.windows.getAll()).map((w) => String(w.id)));
spaces = {
  ...spaces,
  tabSpace: Object.fromEntries(Object.entries(spaces.tabSpace).filter(([id]) => liveTabs.has(id))),
  tabTitle: Object.fromEntries(Object.entries(spaces.tabTitle).filter(([id]) => liveTabs.has(id))),
  active: Object.fromEntries(Object.entries(spaces.active).filter(([id]) => liveWindows.has(id))),
};
if (!windowTabs.some((t) => spaces.tabSpace[t.id])) {
  const shots = Array.isArray(stored.spaceSnapshot) ? stored.spaceSnapshot : Object.fromEntries(Object.entries(stored.spaceSnapshot ?? {}).filter(([id]) => !liveWindows.has(id)));
  const picked = pickSnapshot(shots, windowTabs);
  spaces = restore(spaces, windowTabs, picked?.shot);
  if (!(windowId in spaces.active)) spaces = setActive(spaces, windowId, reopenedSpace(spaces, windowTabs, picked?.shot));
  if (picked?.key && picked.key !== String(windowId)) {
    await chrome.storage.local.set({ spaceSnapshot: forgetSnapshot((await chrome.storage.local.get("spaceSnapshot")).spaceSnapshot, picked.key) });
  }
}
for (const tab of windowTabs) {
  if (!spaces.tabSpace[tab.id]) spaces = assignTab(spaces, tab.id, activeSpace(spaces, windowId).id);
}
for (const { from, to } of await containers.heal(windowTabs)) {
  spaces = assignTab(spaces, to, spaceOfTab(spaces, from, windowId));
}
await pins.load(await chrome.tabs.query({ windowId }));
await containers.load();
await groups.load(await chrome.tabs.query({ windowId }));
for (const tab of await chrome.tabs.query({ windowId, pinned: true })) {
  await chrome.tabs.update(tab.id, { pinned: false });
  await pins.pinTab(tab, { space: spaceOfTab(spaces, tab.id, windowId) });
}
ready = true;
for (const tab of await chrome.tabs.query({ windowId })) {
  if (!spaces.tabSpace[tab.id]) spaces = assignTab(spaces, tab.id, activeSpace(spaces, windowId).id);
}
await saveSpaces();
for (const tab of windowTabs) {
  if (/^chrome:\/\/newtab\/?$/.test(tab.url || "") && tab.title !== "Nova aba") chrome.tabs.update(tab.id, { url: "chrome://newtab/" });
}
applySettings();
restoreCrashedSession();
if ((await chrome.storage.local.get("sidebarCollapsed")).sidebarCollapsed) {
  paintSidebarMode("collapsed");
  setSidebarMode("collapsed");
}
