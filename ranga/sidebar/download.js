import { glyph } from "./kurobe/icons.mjs";
import { painted } from "./motion.js";
import { fileName, progress, status } from "./downloads-model.js";

const $ = (id) => document.getElementById(id);
const card = $("card");
const themeStyle = $("ranga-theme");
const LINGER = 10 * 1000;
let id = null;
let poll;
let timer;

for (const el of document.querySelectorAll("[data-icon]")) {
  el.append(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(el.dataset.icon) }));
}

function setIcon(name) {
  $("icon").replaceChildren(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(name) }));
}

async function close() {
  clearInterval(poll);
  clearTimeout(timer);
  id = null;
  document.body.classList.add("closed");
  await painted();
  document.title = `ranga-spotlight:close:${Date.now()}`;
}

function linger() {
  clearTimeout(timer);
  if (!card.matches(":hover")) timer = setTimeout(close, LINGER);
}

async function paint() {
  const current = id;
  const [item] = await chrome.downloads.search({ id: current });
  if (current !== id) return;
  if (!item) return close();
  if (item.state === "interrupted" && item.error === "USER_CANCELED") return close();
  $("name").textContent = fileName(item);
  $("name").title = item.filename || item.url;
  const share = progress(item);
  const running = item.state === "in_progress";
  $("status").textContent = running ? [share === null ? "Baixando" : `${Math.round(share * 100)}%`, status(item)].join(" · ") : item.state === "complete" ? `Concluído · ${status(item)}` : status(item);
  $("bar").hidden = !running;
  $("bar").classList.toggle("bar--unknown", running && share === null);
  $("bar").style.setProperty("--progress", String(share ?? 0));
  $("actions").hidden = item.state !== "complete" || item.exists === false;
  card.classList.toggle("card--failed", item.state === "interrupted");
  if (item.state === "complete") {
    const src = await chrome.downloads.getFileIcon(item.id, { size: 32 }).catch(() => "");
    if (src) $("icon").replaceChildren(Object.assign(document.createElement("img"), { src, alt: "" }));
    else setIcon("file");
  } else {
    setIcon(running ? "file-down" : "circle-alert");
  }
  if (!running) {
    clearInterval(poll);
    linger();
  }
}

async function open() {
  if (location.hash.startsWith("#idle")) return;
  const next = Number(location.hash.slice(1).split("-")[0]);
  if (!Number.isInteger(next)) return;
  id = next;
  clearTimeout(timer);
  clearInterval(poll);
  poll = setInterval(paint, 700);
  await paint();
  if (id !== next) return;
  document.title = "Ranga";
  document.body.classList.remove("closed");
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
}

$("open").onclick = () => {
  if (id !== null) chrome.downloads.open(id);
  close();
};
$("show").onclick = () => {
  if (id !== null) chrome.downloads.show(id);
  close();
};
$("close").onclick = close;
card.addEventListener("mouseenter", () => clearTimeout(timer));
card.addEventListener("mouseleave", () => { if (id !== null && $("bar").hidden) linger(); });
chrome.downloads.onChanged.addListener((delta) => { if (delta.id === id) paint(); });
window.addEventListener("hashchange", open);

const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => { if (msg.type === "theme") themeStyle.textContent = msg.css; });

open();
