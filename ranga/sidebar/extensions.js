import { glyph } from "./kurobe/icons.mjs";
import { others, pinnedIds, pinnedActions, togglePin } from "./extensions-model.js";
import { available, call } from "./ranga-private.js";
import { pop, kick, squash } from "./motion.js";

function anchorOf(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function iconImage(action) {
  if (!action.icon) return Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph("puzzle") });
  return Object.assign(document.createElement("img"), { src: action.icon, alt: "" });
}

export function setupExtensions({ bar, button, popover, windowId }) {
  const list = popover.querySelector(".extensions-list");
  let actions = [];
  let pins = [];
  let timer;

  if (!available) return { refresh() {} };

  function run(action, anchor) {
    call("runExtensionAction", windowId(), action.id, anchorOf(anchor)).catch(() => {});
  }

  function paintBar() {
    bar.replaceChildren(...pinnedActions(actions, pins).map((action) => {
      const b = document.createElement("button");
      b.className = "extension k-icon-button k-state";
      b.title = action.name;
      b.append(iconImage(action));
      b.onclick = (e) => { e.stopPropagation(); squash(b.firstChild); run(action, b); };
      b.oncontextmenu = (e) => { e.preventDefault(); togglePinned(action.id); };
      return b;
    }));
    button.hidden = actions.length === 0;
  }

  function paintList() {
    list.replaceChildren(...actions.map((action) => {
      const li = document.createElement("li");
      li.className = "k-list-item k-state k-type-label";
      const leading = document.createElement("span");
      leading.className = "k-list-item__leading";
      leading.append(iconImage(action));
      const label = document.createElement("span");
      label.className = "k-list-item__label";
      label.textContent = action.name;
      const pinned = pins.includes(action.id);
      const toggle = document.createElement("button");
      toggle.className = "k-icon-button k-icon-button--small k-state extension-pin";
      toggle.title = pinned ? "Desafixar da barra" : "Fixar na barra";
      toggle.setAttribute("aria-pressed", String(pinned));
      toggle.innerHTML = `<span class="k-icon">${glyph(pinned ? "pin-off" : "pin")}</span>`;
      toggle.onclick = (e) => { e.stopPropagation(); pop(toggle); togglePinned(action.id); };
      li.append(leading, label, toggle);
      li.onclick = (e) => { e.stopPropagation(); close(); run(action, button); };
      return li;
    }));
  }

  async function togglePinned(id) {
    pins = togglePin(pins, id);
    await chrome.storage.local.set({ pinnedExtensions: pins });
  }

  async function load() {
    const [all, stored] = await Promise.all([
      call("getExtensionActions", windowId()).catch(() => []),
      chrome.storage.local.get("pinnedExtensions"),
    ]);
    actions = others(all, chrome.runtime.id);
    pins = pinnedIds(stored.pinnedExtensions, actions);
    paintBar();
    if (!popover.hidden) paintList();
  }

  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(load, 120);
  }

  function close() {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.onclick = (e) => {
    e.stopPropagation();
    if (!popover.hidden) return close();
    kick(button.querySelector(".k-icon"), "rotate(-18deg) scale(1.1)");
    paintList();
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };
  popover.querySelector(".extensions-manage").onclick = (e) => {
    e.stopPropagation();
    close();
    chrome.tabs.create({ url: "chrome://extensions", windowId: windowId() });
  };
  popover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  popover.addEventListener("dismiss", close);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.pinnedExtensions) refresh();
  });

  return { refresh };
}
