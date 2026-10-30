import { glyph } from "./kurobe/icons.mjs";

const hint = document.querySelector(".hint");
const themeStyle = document.getElementById("ranga-theme");
let timer = 0;

function show() {
  const side = location.hash.slice(1).split("-")[0];
  if (side !== "back" && side !== "forward") return;
  clearTimeout(timer);
  document.body.dataset.side = side;
  hint.querySelector(".k-icon").textContent = glyph(side === "back" ? "arrow-left" : "arrow-right");
  document.body.classList.remove("closed", "showing");
  void hint.offsetWidth;
  document.body.classList.add("showing");
  timer = setTimeout(() => {
    document.body.classList.add("closed");
    document.body.classList.remove("showing");
    document.title = `ranga-spotlight:close:${Date.now()}`;
  }, 760);
}

window.addEventListener("hashchange", show);
const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => { if (msg.type === "theme") themeStyle.textContent = msg.css; });
show();
