import { glyph } from "./kurobe/icons.mjs";
import { painted } from "./motion.js";

const $ = (id) => document.getElementById(id);
const card = $("card");
const themeStyle = $("ranga-theme");
const LINGER = 5 * 1000;
const LINGER_WITH_ACTION = 10 * 1000;
let notice = null;
let timer;

for (const el of document.querySelectorAll("[data-icon]")) {
  el.append(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(el.dataset.icon) }));
}

async function close() {
  clearTimeout(timer);
  notice = null;
  document.body.classList.add("closed");
  await painted();
  document.title = `ranga-spotlight:close:${Date.now()}`;
}

function linger() {
  clearTimeout(timer);
  if (notice && !card.matches(":hover")) timer = setTimeout(close, notice.action ? LINGER_WITH_ACTION : LINGER);
}

function open() {
  if (location.hash.startsWith("#idle")) return;
  const params = new URLSearchParams(location.hash.slice(1));
  notice = { id: params.get("id") ?? "", action: params.get("action") ?? "" };
  $("icon").replaceChildren(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(params.get("icon")) || glyph("info") }));
  $("text").textContent = params.get("text") ?? "";
  $("action").textContent = notice.action;
  $("action").hidden = !notice.action;
  document.title = "Ranga";
  document.body.classList.remove("closed");
  card.style.animation = "none";
  void card.offsetWidth;
  card.style.animation = "";
  linger();
}

$("action").onclick = () => {
  if (notice?.id) chrome.runtime.sendMessage({ type: "notice-action", id: notice.id }).catch(() => {});
  document.title = `ranga-notice:action:${Date.now()}`;
  close();
};
$("close").onclick = close;
card.addEventListener("mouseenter", () => clearTimeout(timer));
card.addEventListener("mouseleave", linger);
window.addEventListener("hashchange", open);

const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => { if (msg.type === "theme") themeStyle.textContent = msg.css; });

open();
