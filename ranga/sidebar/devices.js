import { glyph } from "./kurobe/icons.mjs";
import { deviceBlocks } from "./devices-model.js";
import { syncConnected, syncDevices, onSyncChange } from "./sync-ui.js";

function faviconFor(url) {
  const src = new URL(chrome.runtime.getURL("/_favicon/"));
  src.searchParams.set("pageUrl", url);
  src.searchParams.set("size", "32");
  return src.toString();
}

export function setupDevices({ button, popover, openTab }) {
  const list = popover.querySelector(".devices-list");

  function row(tab) {
    const li = document.createElement("li");
    li.className = "k-list-item k-state k-type-label device-tab";
    li.title = tab.url;
    const leading = document.createElement("span");
    leading.className = "k-list-item__leading";
    leading.append(Object.assign(document.createElement("img"), { src: faviconFor(tab.url), alt: "" }));
    const body = document.createElement("span");
    body.className = "device-tab__body";
    body.append(
      Object.assign(document.createElement("span"), { className: "k-list-item__label", textContent: tab.title }),
      Object.assign(document.createElement("span"), { className: "device-tab__host k-type-caption", textContent: tab.host }),
    );
    li.append(leading, body);
    li.onclick = (e) => {
      e.stopPropagation();
      close();
      openTab(tab.url, true);
    };
    return li;
  }

  function block(device) {
    const heading = document.createElement("li");
    heading.className = "device-heading";
    heading.innerHTML = `<span class="k-icon">${glyph("laptop")}</span><span class="k-type-panel"></span><span class="device-heading__when k-type-caption"></span>`;
    heading.children[1].textContent = device.name;
    heading.children[2].textContent = device.when;
    const empty = Object.assign(document.createElement("li"), { className: "favorites-empty k-type-caption", textContent: "Nenhuma aba aberta." });
    return [heading, ...(device.tabs.length ? device.tabs.map(row) : [empty])];
  }

  function paint() {
    const blocks = deviceBlocks(syncDevices());
    list.replaceChildren(...(blocks.length
      ? blocks.flatMap(block)
      : [Object.assign(document.createElement("li"), { className: "favorites-empty k-type-caption", textContent: "Nenhum outro aparelho conectado ainda." })]));
  }

  function close() {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  button.onclick = (e) => {
    e.stopPropagation();
    if (!popover.hidden) return close();
    paint();
    popover.hidden = false;
    button.setAttribute("aria-expanded", "true");
    chrome.runtime.sendMessage({ type: "sync-now" }).catch(() => {});
  };
  popover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  popover.addEventListener("dismiss", close);

  onSyncChange(() => {
    button.hidden = !syncConnected();
    if (button.hidden) close();
    else if (!popover.hidden) paint();
  });
}
