import { glyph } from "./kurobe/icons.mjs";
import { showMenu } from "./context-menu.js";
import { pop } from "./motion.js";
import { call } from "./ranga-private.js";
import {
  pinId, find, parentOf, links, addLink, addFolder, remove, rename, setUrl, toggle, move, place, drifted, prune, tabOf, forgetNode, pinSnapshot, restoreLive,
} from "./pins-model.js";

function faviconFor(url) {
  const src = new URL(chrome.runtime.getURL("/_favicon/"));
  src.searchParams.set("pageUrl", url);
  src.searchParams.set("size", "64");
  return src.toString();
}

function icon(name) {
  return Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(name) });
}

export function setupPins({ section, grid, windowId, spaceId, assign, container, changed }) {
  let pins = {};
  let live = {};
  let renaming = null;
  let drag = null;
  let deferred = null;
  let here = new Map();

  const tree = (space = spaceId()) => pins[space] ?? [];

  async function savePins(next, space = spaceId()) {
    pins = { ...pins, [space]: next };
    await chrome.storage.local.set({ pins });
    changed();
  }

  function announceLive() {
    chrome.runtime.sendMessage({ type: "links" }).catch(() => {});
  }

  async function saveLive(next) {
    live = next;
    await chrome.storage.session.set({ pinLive: live });
    announceLive();
  }

  function nodeIds() {
    return new Set(Object.values(pins).flatMap((t) => links(t).map((l) => l.id)));
  }

  async function load(windowTabs) {
    const stored = await chrome.storage.local.get(["pins", "pinSnapshot"]);
    pins = stored.pins ?? {};
    const session = await chrome.storage.session.get(["pinLive", "pinsHealed"]);
    live = session.pinLive ?? {};
    const healed = session.pinsHealed ?? [];
    if (!healed.includes(windowId())) {
      live = { ...live, ...restoreLive(windowTabs, stored.pinSnapshot, nodeIds()) };
      await chrome.storage.session.set({ pinLive: live, pinsHealed: [...healed, windowId()] });
      announceLive();
    }
  }

  async function save() {
    const tabs = await chrome.tabs.query({});
    live = prune(live, new Set(tabs.map((t) => t.id)), nodeIds());
    await chrome.storage.session.set({ pinLive: live });
    announceLive();
    await chrome.storage.local.set({ pinSnapshot: pinSnapshot(live, tabs) });
  }

  function liveIds() {
    return new Set(Object.keys(live).map(Number));
  }

  async function open(node) {
    const tabId = tabOf(live, node.id, here);
    if (tabId != null) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab) {
        await chrome.tabs.update(tab.id, { active: true });
        return;
      }
    }
    const box = container();
    const created = box
      ? await call("createTab", { windowId: windowId(), container: box, url: node.url, active: true })
      : (await chrome.tabs.create({ url: node.url, windowId: windowId(), active: true })).id;
    await saveLive({ ...live, [created]: node.id });
    await assign(created);
    changed();
  }

  async function pinTab(tab, { parentId = null, space = spaceId() } = {}) {
    const id = pinId("pin");
    await saveLive({ ...live, [tab.id]: id });
    await savePins(addLink(tree(space), { id, url: tab.url || tab.pendingUrl, title: tab.title }, parentId), space);
  }

  async function unpin(node) {
    if (tabOf(live, node.id) != null) await saveLive(forgetNode(live, node.id));
    await savePins(remove(tree(), node.id));
  }

  async function toggleTab(tab) {
    const nodeId = live[tab.id];
    const node = nodeId && find(tree(), nodeId);
    if (node) await unpin(node);
    else await pinTab(tab);
  }

  async function newFolder() {
    const id = pinId("folder");
    renaming = id;
    await savePins(addFolder(tree(), { id, title: "Nova pasta" }));
  }

  function startRename(node) {
    renaming = node.id;
    changed();
  }

  function renameTile(node) {
    const li = document.createElement("li");
    li.className = "ess-rename";
    const input = Object.assign(document.createElement("input"), { className: "k-text-field k-type-label", value: node.title, maxLength: 40 });
    let done = false;
    const finish = async (keep) => {
      if (done) return;
      done = true;
      renaming = null;
      if (keep) await savePins(rename(tree(), node.id, input.value));
      else changed();
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    };
    input.onblur = () => finish(true);
    input.onclick = (e) => e.stopPropagation();
    li.append(input);
    requestAnimationFrame(() => { input.focus(); input.select(); });
    return li;
  }

  function folderEntries(node) {
    const parent = parentOf(tree(), node.id);
    const folders = tree().filter((n) => n.kind === "folder" && n.id !== parent?.id);
    return [
      ...folders.map((f) => ({ icon: "folder", label: `Mover para ${f.title}`, action: () => savePins(move(tree(), node.id, f.id)) })),
      ...(parent ? [{ icon: "folder-open", label: "Tirar da pasta", action: () => savePins(move(tree(), node.id, null, tree().indexOf(parent) + 1)) }] : []),
    ];
  }

  function linkMenu(node, tab, x, y) {
    const away = tab && drifted(node.url, tab.url);
    const folders = folderEntries(node);
    showMenu([
      ...(away ? [
        { icon: "corner-up-left", label: "Voltar ao endereço fixado", action: () => chrome.tabs.update(tab.id, { url: node.url }) },
        { icon: "pin", label: "Fixar o endereço atual", action: () => savePins(setUrl(tree(), node.id, tab.url, tab.title)) },
      ] : []),
      { icon: "pencil", label: "Renomear", action: () => startRename(node) },
      { icon: "link", label: "Copiar link", action: () => navigator.clipboard.writeText(tab?.url || node.url) },
      "divider",
      ...folders,
      { icon: "folder-plus", label: "Nova pasta", action: newFolder },
      "divider",
      { icon: "pin-off", label: "Desafixar", action: () => unpin(node) },
      ...(tab ? [{ icon: "x", label: "Fechar", danger: true, action: () => chrome.tabs.remove(tab.id) }] : []),
    ], x, y);
  }

  function folderMenu(node, x, y) {
    showMenu([
      { icon: "pencil", label: "Renomear", action: () => startRename(node) },
      { icon: "folder-plus", label: "Nova pasta", action: newFolder },
      "divider",
      { icon: "trash-2", label: "Remover pasta", danger: true, action: () => savePins(remove(tree(), node.id)) },
    ], x, y);
  }

  function linkTile(node, tabs, activeId) {
    if (renaming === node.id) return renameTile(node);
    const tab = tabs.get(tabOf(live, node.id, tabs));
    const li = document.createElement("li");
    li.className = "ess k-state" + (tab ? "" : " ess--closed") + (tab && tab.id === activeId ? " ess--active" : "");
    li.title = node.title;
    const img = Object.assign(document.createElement("img"), { alt: "", src: tab?.favIconUrl || faviconFor(node.url) });
    img.onerror = () => img.replaceWith(icon("globe"));
    li.append(img);
    if (tab && drifted(node.url, tab.url)) {
      const back = document.createElement("button");
      back.className = "ess-back k-state";
      back.title = "Voltar ao endereço fixado";
      back.append(icon("corner-up-left"));
      back.onclick = (e) => { e.stopPropagation(); chrome.tabs.update(tab.id, { url: node.url }); };
      li.append(back);
    }
    li.dataset.id = node.id;
    li.onpointerdown = (e) => grab(e, node, li);
    li.onclick = () => { if (dragged(li)) return; pop(li); open(node); };
    li.onauxclick = (e) => { if (e.button === 1 && tab) chrome.tabs.remove(tab.id); };
    li.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); linkMenu(node, tab, e.clientX, e.clientY); };
    return li;
  }

  function folderTiles(node, tabs, activeId) {
    if (renaming === node.id) return [renameTile(node)];
    const li = document.createElement("li");
    const hasActive = node.children.some((c) => live[activeId] === c.id);
    li.className = "ess ess--folder k-state" + (node.open ? " ess--open" : "") + (!node.open && hasActive ? " ess--active" : "");
    li.title = node.title;
    li.append(icon(node.open ? "folder-open" : "folder"), Object.assign(document.createElement("span"), { className: "ess-name k-type-caption", textContent: node.title }));
    li.dataset.id = node.id;
    li.onpointerdown = (e) => grab(e, node, li);
    li.onclick = () => { if (dragged(li)) return; pop(li); savePins(toggle(tree(), node.id)); };
    li.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); folderMenu(node, e.clientX, e.clientY); };
    if (!node.open) return [li];
    const group = document.createElement("li");
    group.className = "ess-group";
    const inner = document.createElement("ul");
    inner.className = "ess-grid";
    inner.replaceChildren(...node.children.map((c) => linkTile(c, tabs, activeId)));
    if (!node.children.length) inner.append(Object.assign(document.createElement("li"), { className: "ess-empty k-type-caption", textContent: "Pasta vazia. Use Mover para no menu de uma fixada." }));
    group.append(inner);
    return [li, group];
  }

  function dragged(li) {
    if (!li.dataset.dragged) return false;
    delete li.dataset.dragged;
    return true;
  }

  function grab(e, node, li) {
    if (e.button !== 0 || e.target.closest("button")) return;
    drag = { node, li, x: e.clientX, y: e.clientY, active: false, target: null };
  }

  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const tile = el?.closest(".ess[data-id]");
    if (tile && tile !== drag.li) return { el: tile, id: tile.dataset.id, folder: tile.classList.contains("ess--folder") };
    if (el?.closest(".tabs-wrap, .today-header, #new-tab")) return { el: document.querySelector(".tabs-wrap"), unpin: true };
    return null;
  }

  function mark(target) {
    for (const el of document.querySelectorAll(".ess--drop, .tabs-wrap--unpin")) el.classList.remove("ess--drop", "tabs-wrap--unpin");
    if (target?.unpin) target.el.classList.add("tabs-wrap--unpin");
    else target?.el.classList.add("ess--drop");
  }

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.active) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.active = true;
      drag.li.classList.add("ess--dragging");
    }
    drag.li.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
    drag.target = targetAt(e.clientX, e.clientY);
    mark(drag.target);
  });

  async function drop() {
    const done = drag;
    drag = null;
    if (!done?.active) return;
    done.li.dataset.dragged = "1";
    done.li.classList.remove("ess--dragging");
    done.li.style.transform = "";
    mark(null);
    const target = done.target;
    if (target?.unpin) await unpin(done.node);
    else if (target?.folder && done.node.kind !== "folder") await savePins(move(tree(), done.node.id, target.id));
    else if (target) await savePins(place(tree(), done.node.id, target.id));
    if (deferred) {
      const args = deferred;
      deferred = null;
      render(...args);
    }
  }

  document.addEventListener("pointerup", drop);
  document.addEventListener("pointercancel", drop);

  function render(tabs, activeId) {
    if (drag?.active) {
      deferred = [tabs, activeId];
      return;
    }
    here = tabs;
    const nodes = tree();
    section.hidden = nodes.length === 0;
    grid.replaceChildren(...nodes.flatMap((n) => (n.kind === "folder" ? folderTiles(n, tabs, activeId) : [linkTile(n, tabs, activeId)])));
  }

  section.oncontextmenu = (e) => {
    e.preventDefault();
    showMenu([{ icon: "folder-plus", label: "Nova pasta", action: newFolder }], e.clientX, e.clientY);
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.pins) {
      pins = changes.pins.newValue ?? {};
      changed();
    }
    if (area === "session" && changes.pinLive) {
      live = changes.pinLive.newValue ?? {};
      changed();
    }
  });

  return { load, save, render, liveIds, pinTab, toggleTab, newFolder, contains: (x, y) => Boolean(document.elementFromPoint(x, y)?.closest("#pins")) };
}
