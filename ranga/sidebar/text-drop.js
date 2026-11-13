import { droppedText } from "./link-model.js";

export function setupTextDrop(area, highlight, open) {
  let inside = false;
  const carries = (e) => !inside && ["text/plain", "text/uri-list"].some((type) => e.dataTransfer.types.includes(type));
  const clear = () => highlight.classList.remove("tabs-wrap--search");
  document.addEventListener("dragstart", () => { inside = true; });
  document.addEventListener("dragend", () => { inside = false; });
  area.addEventListener("dragover", (e) => {
    if (!carries(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    highlight.classList.add("tabs-wrap--search");
  });
  area.addEventListener("dragleave", (e) => { if (!area.contains(e.relatedTarget)) clear(); });
  area.addEventListener("drop", async (e) => {
    clear();
    if (!carries(e)) return;
    e.preventDefault();
    const dropped = droppedText(e.dataTransfer.getData("text/uri-list"), e.dataTransfer.getData("text/plain"));
    if (dropped?.url) await open(dropped.url);
    else if (dropped) await chrome.search.query({ text: dropped.text, tabId: await open("about:blank") });
  });
}
