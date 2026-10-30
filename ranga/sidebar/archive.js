import { glyph } from "./kurobe/icons.mjs";

function dayLabel(time, now = new Date()) {
  const day = new Date(time);
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(now) - start(day)) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  return day.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function setupArchive({ popover, reopen }) {
  const list = popover.querySelector(".archive-list");
  const empty = popover.querySelector(".archive-empty-all");

  async function paint() {
    const { archive = [] } = await chrome.storage.local.get("archive");
    const rows = [];
    let label = null;
    for (const [index, entry] of archive.slice(0, 80).entries()) {
      const day = dayLabel(entry.archivedAt);
      if (day !== label) {
        label = day;
        rows.push(Object.assign(document.createElement("li"), { className: "archive-day k-type-section", textContent: day }));
      }
      const li = document.createElement("li");
      li.className = "k-list-item k-state k-type-label";
      li.title = entry.url;
      const leading = document.createElement("span");
      leading.className = "k-list-item__leading";
      const img = document.createElement("img");
      img.alt = "";
      img.src = entry.favIconUrl || "";
      img.onerror = () => img.replaceWith(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph("globe") }));
      leading.append(img);
      const title = Object.assign(document.createElement("span"), { className: "k-list-item__label", textContent: entry.title });
      li.append(leading, title);
      li.onclick = async (e) => {
        e.stopPropagation();
        await reopen([entry]);
        const { archive: current = [] } = await chrome.storage.local.get("archive");
        current.splice(index, 1);
        await chrome.storage.local.set({ archive: current });
        paint();
      };
      rows.push(li);
    }
    list.replaceChildren(...(rows.length ? rows : [Object.assign(document.createElement("li"), { className: "favorites-empty k-type-caption", textContent: "Nada arquivado." })]));
    empty.hidden = archive.length === 0;
  }

  function close() {
    popover.hidden = true;
  }

  empty.onclick = async (e) => {
    e.stopPropagation();
    await chrome.storage.local.set({ archive: [] });
    paint();
  };
  popover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  popover.addEventListener("dismiss", close);

  return {
    async open() {
      await paint();
      popover.hidden = false;
    },
  };
}
