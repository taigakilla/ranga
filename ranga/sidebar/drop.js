import { glyph } from "./kurobe/icons.mjs";

const ZONES = {
  left: ["panel-left", "Dividir à esquerda"],
  right: ["panel-right", "Dividir à direita"],
  top: ["panel-top", "Dividir em cima"],
  bottom: ["panel-bottom", "Dividir embaixo"],
  window: ["app-window", "Abrir em nova janela"],
  join: ["log-in", "Mover para esta janela"],
};
const label = document.querySelector(".label");
const pair = document.querySelector(".pair");
const FIRST = new Set(["left", "top"]);

function faviconFor(url) {
  const src = new URL(chrome.runtime.getURL("/_favicon/"));
  src.searchParams.set("pageUrl", url);
  src.searchParams.set("size", "32");
  return src.toString();
}

function chip(tab) {
  const el = Object.assign(document.createElement("span"), { className: "chip k-type-label" });
  const img = Object.assign(document.createElement("img"), { alt: "", src: tab.favIconUrl || faviconFor(tab.url || tab.pendingUrl || "") });
  img.onerror = () => img.replaceWith(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph("globe") }));
  el.append(img, Object.assign(document.createElement("span"), { className: "chip__title", textContent: tab.title || tab.url || "" }));
  return el;
}

async function paintPair(zone) {
  const { tabDrag } = await chrome.storage.session.get("tabDrag");
  const [dragged, partner] = await Promise.all([tabDrag?.tab, tabDrag?.partner].map((id) => (id ? chrome.tabs.get(id).catch(() => null) : null)));
  if (document.body.dataset.zone !== zone) return;
  if (!dragged) {
    pair.replaceChildren();
    return;
  }
  if (zone === "window" || zone === "join" || !partner) {
    pair.replaceChildren(chip(dragged));
    return;
  }
  const join = Object.assign(document.createElement("span"), { className: "k-icon join", textContent: glyph(zone === "top" || zone === "bottom" ? "rows-2" : "columns-2") });
  const chips = FIRST.has(zone) ? [chip(dragged), join, chip(partner)] : [chip(partner), join, chip(dragged)];
  pair.replaceChildren(...chips);
}
const themeStyle = document.getElementById("ranga-theme");

function show() {
  const zone = location.hash.slice(1).split("-")[0];
  if (!ZONES[zone]) return;
  const [icon, text] = ZONES[zone];
  const changed = document.body.dataset.zone !== zone;
  document.body.dataset.zone = zone;
  document.body.classList.remove("closed");
  label.querySelector(".action .k-icon").textContent = glyph(icon);
  label.querySelector(".action .text").textContent = text;
  paintPair(zone);
  if (changed) {
    label.style.animation = "none";
    void label.offsetWidth;
    label.style.animation = "";
  }
}

window.addEventListener("hashchange", show);
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.tabDrag?.newValue && document.body.dataset.zone) paintPair(document.body.dataset.zone);
});
const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => { if (msg.type === "theme") themeStyle.textContent = msg.css; });
show();
