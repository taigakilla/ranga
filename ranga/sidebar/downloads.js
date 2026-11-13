import { glyph } from "./kurobe/icons.mjs";
import { fileName, progress, status, active, overall } from "./downloads-model.js";
import { pop, squash, animate, reducedMotion } from "./motion.js";
import { toast } from "./toast.js";

const RING = 2 * Math.PI * 16;

function iconButton(icon, title, run) {
  const b = document.createElement("button");
  b.className = "k-icon-button k-icon-button--small k-state";
  b.title = title;
  b.innerHTML = `<span class="k-icon">${glyph(icon)}</span>`;
  b.onclick = (e) => { e.stopPropagation(); run(); };
  return b;
}

export function setupDownloads({ button, popover, windowId, peek }) {
  const list = popover.querySelector(".downloads-list");
  const fill = button.querySelector(".ring-fill");
  let items = [];
  let poll;
  const icons = new Map();

  async function load() {
    items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 12 });
    paintButton();
    if (!popover.hidden) paintList();
    clearInterval(poll);
    if (active(items).length) poll = setInterval(load, 700);
  }

  function paintButton() {
    button.hidden = items.length === 0;
    const value = overall(items);
    button.classList.toggle("downloads-button--active", value !== null || active(items).length > 0);
    fill.style.strokeDashoffset = String(RING * (1 - (value ?? 0)));
  }

  async function icon(item, holder) {
    if (!icons.has(item.id)) icons.set(item.id, await chrome.downloads.getFileIcon(item.id, { size: 32 }).catch(() => ""));
    const src = icons.get(item.id);
    holder.replaceChildren(src ? Object.assign(document.createElement("img"), { src, alt: "" }) : Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph("file") }));
  }

  function row(item) {
    const li = document.createElement("li");
    li.className = "k-list-item k-state k-type-label download" + (item.state === "complete" ? "" : " download--pending");
    li.title = item.filename || item.url;
    const leading = document.createElement("span");
    leading.className = "k-list-item__leading";
    icon(item, leading);
    const body = document.createElement("span");
    body.className = "download__body";
    const name = Object.assign(document.createElement("span"), { className: "k-list-item__label", textContent: fileName(item) });
    const detail = Object.assign(document.createElement("span"), { className: "download__status k-type-caption", textContent: status(item) });
    body.append(name, detail);
    const share = progress(item);
    if (item.state === "in_progress") {
      const bar = document.createElement("span");
      bar.className = "download__bar";
      bar.style.setProperty("--progress", share === null ? "0.3" : String(share));
      bar.classList.toggle("download__bar--unknown", share === null);
      body.append(bar);
    }
    const actions = document.createElement("span");
    actions.className = "k-list-item__trailing";
    if (item.state === "in_progress") {
      actions.append(
        item.paused
          ? iconButton("play", "Continuar", () => chrome.downloads.resume(item.id).then(load))
          : iconButton("pause", "Pausar", () => chrome.downloads.pause(item.id).then(load)),
        iconButton("x", "Cancelar", () => chrome.downloads.cancel(item.id).then(load)),
      );
    } else if (item.state === "complete" && item.exists !== false) {
      actions.append(iconButton("folder-open", "Mostrar na pasta", () => chrome.downloads.show(item.id)));
      li.onclick = (e) => { e.stopPropagation(); chrome.downloads.open(item.id); close(); };
    } else if (item.state === "interrupted") {
      actions.append(iconButton("rotate-cw", "Tentar de novo", () => chrome.downloads.download({ url: item.url }).then(load)));
    }
    li.append(leading, body, actions);
    return li;
  }

  function paintList() {
    list.replaceChildren(...(items.length ? items.map(row) : [Object.assign(document.createElement("li"), { className: "favorites-empty k-type-caption", textContent: "Nenhum download ainda." })]));
  }

  function close() {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.onclick = async (e) => {
    e.stopPropagation();
    if (!popover.hidden) return close();
    await load();
    paintList();
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };
  popover.querySelector(".downloads-all").onclick = (e) => {
    e.stopPropagation();
    close();
    chrome.tabs.create({ url: "chrome://downloads", windowId: windowId() });
  };
  popover.querySelector(".downloads-clear").onclick = async (e) => {
    e.stopPropagation();
    await chrome.downloads.erase({ state: "complete" });
    await chrome.downloads.erase({ state: "interrupted" });
    load();
  };
  popover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  popover.addEventListener("dismiss", close);

  async function focused() {
    const win = await chrome.windows.getLastFocused().catch(() => null);
    return win?.id === windowId();
  }

  async function drop() {
    const rect = button.getBoundingClientRect();
    const file = Object.assign(document.createElement("span"), { className: "download-drop k-icon", textContent: glyph("file-down") });
    file.style.left = `${rect.left + rect.width / 2}px`;
    file.style.top = `${rect.top + rect.height / 2}px`;
    document.body.append(file);
    const fall = animate(file, [
      { opacity: 0, transform: "translate(-50%, -50%) translateY(-96px) scale(0.6) rotate(-12deg)" },
      { opacity: 1, offset: 0.35 },
      { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
    ], "spatial-slow");
    await fall?.finished.catch(() => {});
    squash(button.querySelector(".k-icon"));
    const fade = file.animate([{ opacity: 1, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(0.4)" }], { duration: 160, easing: "ease-in" });
    await fade.finished.catch(() => {});
    file.remove();
  }

  chrome.downloads.onCreated.addListener(async (item) => {
    await load();
    if (!(await focused())) return pop(button);
    await peek(2600);
    if (reducedMotion()) pop(button);
    else drop();
  });
  chrome.downloads.onChanged.addListener(async (delta) => {
    await load();
    if (delta.state?.current !== "complete" || !(await focused())) return;
    await peek(4000);
    pop(button);
    if (popover.hidden) toast("Download concluído", { label: "Abrir", run: () => chrome.downloads.open(delta.id) }, "file-check");
  });
  chrome.downloads.onErased.addListener(load);

  load();
}
