import { glyph } from "./kurobe/icons.mjs";
import "./kurobe/loading-indicator.mjs";
import { showMenu } from "./context-menu.js";
import { animate, pop } from "./motion.js";
import { call } from "./ranga-private.js";
import { faviconOf } from "./tabs-model.js";
import { pinId, drifted, prune, tabOf, pinSnapshot } from "./pins-model.js";
import { loadContainers, pagesOf, addPage, removePage, updatePage, findPage, toggleGroup, pageIds, restorePages, pageTitle } from "./containers-model.js";

function icon(name) {
  return Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(name) });
}

function faviconFor(url) {
  const src = new URL(chrome.runtime.getURL("/_favicon/"));
  src.searchParams.set("pageUrl", url);
  src.searchParams.set("size", "32");
  return src.toString();
}

function iconButton(name, title, onclick) {
  const b = document.createElement("button");
  b.className = "k-icon-button k-icon-button--small k-state";
  b.type = "button";
  b.title = title;
  b.append(icon(name));
  b.onclick = (e) => { e.stopPropagation(); onclick(e); };
  return b;
}

export function setupContainerGroups({ section, list, windowId, assign, session, sessionOfTab, changed, edit, newTab, customName, bookmarkName }) {
  let containers = loadContainers(undefined);
  let live = {};
  let renaming = false;

  async function save(next) {
    containers = next;
    await chrome.storage.local.set({ containers });
    changed();
  }

  async function saveLive(next) {
    live = next;
    await chrome.storage.session.set({ containerLive: live });
  }

  async function load(windowTabs) {
    const stored = await chrome.storage.local.get(["containers", "containerPageSnapshot"]);
    containers = loadContainers(stored.containers);
    const session = await chrome.storage.session.get(["containerLive", "containerPagesHealed"]);
    live = session.containerLive ?? {};
    const healed = session.containerPagesHealed ?? [];
    if (!healed.includes(windowId())) {
      live = { ...live, ...restorePages(windowTabs, stored.containerPageSnapshot, containers) };
      await chrome.storage.session.set({ containerLive: live, containerPagesHealed: [...healed, windowId()] });
    }
  }

  async function persist() {
    const tabs = await chrome.tabs.query({});
    live = prune(live, new Set(tabs.map((t) => t.id)), pageIds(containers));
    await chrome.storage.session.set({ containerLive: live });
    await chrome.storage.local.set({ containerPageSnapshot: pinSnapshot(live, tabs) });
  }

  function liveIds() {
    return new Set(Object.keys(live).map(Number));
  }

  async function create(url, active) {
    const box = session();
    return box ? call("createTab", { windowId: windowId(), container: box, url, active }) : (await chrome.tabs.create({ windowId: windowId(), url, active })).id;
  }

  async function open(page) {
    const tabId = tabOf(live, page.id);
    const tab = tabId != null ? await chrome.tabs.get(tabId).catch(() => null) : null;
    if (tab) {
      if (tab.windowId === windowId() && sessionOfTab(tab.id) === session()) await assign(tab.id);
      await chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId !== windowId()) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }
    const created = await create(page.url, true);
    await saveLive({ ...live, [created]: page.id });
    await assign(created);
    changed();
  }

  async function openAll(container) {
    for (const page of pagesOf(container)) {
      if (tabOf(live, page.id) != null) continue;
      const created = await create(page.url, false);
      live = { ...live, [created]: page.id };
      await assign(created);
    }
    await saveLive(live);
    changed();
  }

  async function closeAll(container) {
    const ids = pagesOf(container).map((p) => tabOf(live, p.id)).filter((id) => id != null);
    if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
  }

  async function saveTab(tab, containerId) {
    const id = pinId("cpage");
    await saveLive({ ...live, [tab.id]: id });
    const url = tab.url || tab.pendingUrl || "";
    await save(addPage(containers, containerId, { id, url, title: customName(tab.id) || bookmarkName(url) || (tab.status === "complete" ? tab.title : "") }));
  }

  async function adopt(tabId, containerId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab) await saveTab(tab, containerId);
  }

  async function forget(page, tab) {
    await save(removePage(containers, page.id));
    if (tab) {
      const { [tab.id]: _, ...rest } = live;
      await saveLive(rest);
    }
    changed();
  }

  function titleOf(page, tab) {
    return pageTitle(page, { custom: tab ? customName(tab.id) : "", bookmark: bookmarkName(page.url), live: tab?.status === "complete" ? tab.title : "" });
  }

  function rename(li, page, tab) {
    const label = li.querySelector(".k-list-item__label");
    const current = titleOf(page, tab);
    const input = Object.assign(document.createElement("input"), { className: "k-text-field k-type-label tab__rename", value: current, maxLength: 80 });
    let done = false;
    renaming = true;
    const finish = (keep) => {
      if (done) return;
      done = true;
      renaming = false;
      input.replaceWith(label);
      const title = input.value.trim();
      if (keep && title && title !== current) save(updatePage(containers, page.id, { title }));
      else changed();
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    };
    input.onblur = () => finish(true);
    input.onclick = (e) => e.stopPropagation();
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  function pageMenu(container, page, tab, li, x, y) {
    const away = tab && drifted(page.url, tab.url);
    showMenu([
      ...(away ? [
        { icon: "corner-up-left", label: "Voltar à página salva", action: () => chrome.tabs.update(tab.id, { url: page.url }) },
        { icon: "save", label: "Salvar o endereço atual", action: () => save(updatePage(containers, page.id, { url: tab.url })) },
      ] : []),
      { icon: "pencil", label: "Renomear", action: () => rename(li, page, tab) },
      { icon: "link", label: "Copiar link", action: () => navigator.clipboard.writeText(tab?.url || page.url) },
      "divider",
      { icon: "trash-2", label: `Tirar do grupo ${container.name}`, action: () => forget(page, tab) },
      ...(tab ? [{ icon: "x", label: "Fechar", danger: true, action: () => chrome.tabs.remove(tab.id) }] : []),
    ], x, y);
  }

  function groupMenu(container, x, y) {
    const open = pagesOf(container).filter((p) => tabOf(live, p.id) != null).length;
    showMenu([
      { icon: "layers", label: "Abrir todas as páginas", action: () => openAll(container) },
      ...(open ? [{ icon: "x", label: "Fechar as abas do grupo", action: () => closeAll(container) }] : []),
      { icon: "plus", label: `Nova aba no grupo ${container.name}`, action: () => newTab(container.id) },
      "divider",
      { icon: "settings", label: `Editar ${container.name}`, action: () => edit(container.id) },
    ], x, y);
  }

  function pageRow(container, page, tabs, activeId) {
    const tab = tabs.get(tabOf(live, page.id));
    const li = document.createElement("li");
    li.className = "k-list-item k-state k-type-label tab group-page" + (tab ? "" : " group-page--closed") + (tab && tab.id === activeId ? " k-list-item--active" : "");
    const title = titleOf(page, tab);
    li.title = title;
    const leading = document.createElement("span");
    leading.className = "k-list-item__leading";
    if (tab?.status === "loading") {
      const loader = document.createElement("k-loading-indicator");
      loader.setAttribute("size", "18");
      leading.append(loader);
    } else {
      const img = Object.assign(document.createElement("img"), { alt: "", src: (tab && faviconOf(tab)) || faviconFor(page.url) });
      img.onerror = () => img.replaceWith(icon("globe"));
      leading.append(img);
    }
    const label = Object.assign(document.createElement("span"), { className: "k-list-item__label", textContent: title });
    label.ondblclick = (e) => { e.stopPropagation(); rename(li, page, tab); };
    li.append(leading, label);
    if (tab && drifted(page.url, tab.url)) {
      const back = iconButton("corner-up-left", "Voltar à página salva", () => chrome.tabs.update(tab.id, { url: page.url }));
      back.classList.add("group-page__back");
      li.append(back);
    }
    if (tab) {
      const trailing = document.createElement("span");
      trailing.className = "k-list-item__trailing";
      trailing.append(iconButton("x", "Fechar (a página continua salva)", () => chrome.tabs.remove(tab.id)));
      li.append(trailing);
    }
    li.onclick = () => { pop(leading); open(page); };
    li.onauxclick = (e) => { if (e.button === 1 && tab) chrome.tabs.remove(tab.id); };
    li.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); pageMenu(container, page, tab, li, e.clientX, e.clientY); };
    return li;
  }

  function group(container, tabs, activeId) {
    const pages = pagesOf(container);
    const openTabs = pages.filter((p) => tabs.has(tabOf(live, p.id)));
    const holdsActive = pages.some((p) => tabOf(live, p.id) === activeId);
    const li = document.createElement("li");
    li.className = "group" + (container.collapsed ? " group--collapsed" : "");
    li.style.setProperty("--container-color", container.color);
    li.dataset.id = container.id;
    const head = document.createElement("div");
    head.className = "group__head k-state k-type-label";
    head.setAttribute("role", "button");
    head.setAttribute("aria-expanded", String(!container.collapsed));
    head.title = container.collapsed ? "Mostrar o grupo" : "Recolher o grupo";
    const chip = document.createElement("span");
    chip.className = "group__chip";
    chip.append(icon(container.icon), Object.assign(document.createElement("span"), { textContent: container.name }));
    const count = Object.assign(document.createElement("span"), { className: "group__count k-type-caption", textContent: openTabs.length ? `${openTabs.length}/${pages.length}` : String(pages.length) });
    const chevron = icon("chevron-down");
    chevron.classList.add("group__chevron");
    const add = iconButton("plus", `Nova aba no grupo ${container.name}`, () => newTab(container.id));
    add.classList.add("group__add");
    head.append(chip, count, add, chevron);
    head.onclick = async () => {
      const turn = container.collapsed ? "rotate(0deg)" : "rotate(-90deg)";
      animate(chevron, [{ transform: getComputedStyle(chevron).transform }, { transform: turn }], "spatial-default");
      chevron.style.transform = turn;
      const body = li.querySelector(".group__pages");
      if (body && !container.collapsed) {
        const leaving = holdsActive ? [...body.children].filter((row) => !row.classList.contains("k-list-item--active")) : [body];
        await Promise.all(leaving.map((el) => {
          el.style.overflow = "hidden";
          return animate(el, [{ height: `${el.offsetHeight}px`, minHeight: "0px", opacity: 1 }, { height: "0px", minHeight: "0px", paddingTop: "0px", paddingBottom: "0px", opacity: 0 }], "spatial-fast")?.finished.catch(() => {});
        }));
        for (const el of leaving) el.style.display = "none";
      }
      save(toggleGroup(containers, container.id));
    };
    head.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); groupMenu(container, e.clientX, e.clientY); };
    li.append(head);
    const visible = container.collapsed ? pages.filter((p) => tabOf(live, p.id) === activeId) : pages;
    if (visible.length) {
      const body = document.createElement("ul");
      body.className = "group__pages k-list";
      body.append(...visible.map((page) => pageRow(container, page, tabs, activeId)));
      li.append(body);
    }
    return li;
  }

  let expanded = null;

  function render(tabs, activeId) {
    if (renaming) return;
    const shown = containers.filter((c) => pagesOf(c).length);
    section.hidden = shown.length === 0;
    const before = expanded ?? new Set(shown.filter((c) => !c.collapsed).map((c) => c.id));
    expanded = new Set(shown.filter((c) => !c.collapsed).map((c) => c.id));
    const turning = new Map([...list.querySelectorAll(".group")].map((g) => [g.dataset.id, getComputedStyle(g.querySelector(".group__chevron")).transform]));
    const peeking = new Map([...list.querySelectorAll(".group--collapsed .group__pages")].map((body) => [body.parentElement.dataset.id, body.offsetHeight]));
    list.replaceChildren(...shown.map((c) => group(c, tabs, activeId)));
    for (const g of list.querySelectorAll(".group")) {
      const chevron = g.querySelector(".group__chevron");
      const from = turning.get(g.dataset.id);
      const to = getComputedStyle(chevron).transform;
      if (from && from !== to) animate(chevron, [{ transform: from }, { transform: to }], "spatial-default");
    }
    for (const id of expanded) {
      if (before.has(id)) continue;
      const body = list.querySelector(`.group[data-id="${CSS.escape(id)}"] .group__pages`);
      const from = peeking.get(id) ?? 0;
      if (body) animate(body, [{ height: `${from}px`, opacity: from ? 1 : 0 }, { height: `${body.offsetHeight}px`, opacity: 1 }], "spatial-default");
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.containers) {
      containers = loadContainers(changes.containers.newValue);
      changed();
    }
    if (area === "session" && changes.containerLive) {
      live = changes.containerLive.newValue ?? {};
      changed();
    }
  });

  return {
    load, persist, render, liveIds, saveTab, adopt,
    list: () => containers,
    pageOfTab: (tabId) => (live[tabId] ? findPage(containers, live[tabId]) : null),
  };
}
