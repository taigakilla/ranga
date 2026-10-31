import { glyph } from "./kurobe/icons.mjs";
import "./kurobe/loading-indicator.mjs";
import { measure, flip, enter, exit, pop } from "./motion.js";
import { splitEdges } from "./tabs-model.js";

function favicon(url) {
  const img = document.createElement("img");
  img.alt = "";
  img.src = url || "";
  img.onerror = () => img.replaceWith(Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph("globe") }));
  return img;
}

export function createTabList({ list, indicator, onActivate, onClose, onMute, onRename, onContextMenu, onMove, dropZone, pageDrop }) {
  const rows = new Map();
  const selected = new Set();
  let anchor = null;
  let drag = null;
  let pending = null;

  function paintSelection() {
    for (const [id, li] of rows) li.classList.toggle("tab--selected", selected.has(id));
    list.classList.toggle("k-list--selecting", selected.size > 1);
  }

  function clearSelection() {
    selected.clear();
    anchor = null;
    paintSelection();
  }

  function activeId() {
    return [...rows.values()].find((li) => li.item?.active)?.item.id ?? null;
  }

  function select(id, e) {
    const order = [...list.children].map((li) => Number(li.dataset.id));
    if (!selected.size && activeId() !== null) selected.add(activeId());
    if (e.shiftKey) {
      const from = order.indexOf(anchor ?? activeId() ?? id);
      const to = order.indexOf(id);
      if (!e.ctrlKey) selected.clear();
      for (const i of order.slice(Math.min(from, to), Math.max(from, to) + 1)) selected.add(i);
    } else {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      anchor = id;
    }
    paintSelection();
  }

  function rename(id) {
    const li = rows.get(id);
    if (!li || li.dataset.renaming) return;
    li.dataset.renaming = "1";
    const label = li.querySelector(".k-list-item__label");
    const input = Object.assign(document.createElement("input"), { className: "k-text-field k-type-label tab__rename", value: li.item.title, maxLength: 80 });
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      delete li.dataset.renaming;
      input.replaceWith(label);
      if (keep && input.value.trim() !== li.item.title) onRename(id, input.value);
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    };
    input.onblur = () => finish(true);
    input.onclick = (e) => e.stopPropagation();
    input.onpointerdown = (e) => e.stopPropagation();
    label.replaceWith(input);
    input.focus();
    input.select();
  }

  function selection() {
    return [...list.children].map((li) => Number(li.dataset.id)).filter((id) => selected.has(id));
  }

  function dragTo(e) {
    let dy = e.clientY - drag.startY;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, dy) < 5) return;
      drag.active = true;
      drag.listTop = list.getBoundingClientRect().top;
      drag.rows = [...list.children];
      drag.from = drag.rows.indexOf(drag.li);
      drag.step = drag.rows.length > 1 ? drag.rows[1].offsetTop - drag.rows[0].offsetTop : drag.li.offsetHeight;
      drag.li.classList.add("tab--dragging");
      list.classList.add("k-list--dragging");
      document.body.classList.add("dragging-tab");
      indicator.style.opacity = "0";
    }
    dy -= list.getBoundingClientRect().top - drag.listTop;
    drag.li.style.transform = `translateY(${dy}px)`;
    drag.point = [e.clientX, e.clientY];
    const page = Boolean(pageDrop) && (e.clientX > innerWidth || e.clientX < 0);
    if (page) pageDrop.over(Number(drag.li.dataset.id), e.clientX, e.clientY);
    else if (drag.page) pageDrop.leave();
    drag.page = page;
    drag.li.classList.toggle("tab--lifted", page);
    drag.out = !page && (dropZone?.over(e.clientX, e.clientY) ?? false);
    document.body.classList.toggle("dragging-tab--over", drag.out);
    drag.to = Math.max(0, Math.min(drag.rows.length - 1, drag.from + Math.round(dy / drag.step)));
    drag.rows.forEach((row, i) => {
      if (row === drag.li) return;
      const shift = drag.from < i && i <= drag.to ? -drag.step : drag.to <= i && i < drag.from ? drag.step : 0;
      row.style.transform = shift ? `translateY(${shift}px)` : "";
    });
  }

  function drop(e) {
    const done = drag;
    drag = null;
    if (!done?.active) return;
    done.li.dataset.dragged = "1";
    for (const row of done.rows) row.style.transform = "";
    done.li.classList.remove("tab--dragging", "tab--lifted");
    list.classList.remove("k-list--dragging");
    document.body.classList.remove("dragging-tab", "dragging-tab--over");
    if (done.out) done.li.style.transform = "";
    if (pending) {
      const items = pending;
      pending = null;
      render(items);
    }
    if (done.page) {
      done.li.style.transform = "";
      pageDrop.drop(Number(done.li.dataset.id), e.type === "pointerup" ? [e.clientX, e.clientY] : null);
      moveIndicator();
    } else if (done.out) {
      dropZone.drop(Number(done.li.dataset.id));
      moveIndicator();
    } else if (done.to !== done.from) onMove(Number(done.li.dataset.id), done.rows[done.to].item);
    else moveIndicator();
  }

  document.addEventListener("pointermove", (e) => { if (drag) dragTo(e); });
  document.addEventListener("pointerup", drop);
  document.addEventListener("pointercancel", drop);

  function paintLeading(li, item) {
    const key = item.loading ? "loading" : item.favIconUrl || "";
    if (li.dataset.leading === key) return;
    li.dataset.leading = key;
    const leading = li.querySelector(".k-list-item__leading");
    if (item.loading) {
      const loader = document.createElement("k-loading-indicator");
      loader.setAttribute("size", "18");
      leading.replaceChildren(loader);
    } else {
      leading.replaceChildren(favicon(item.favIconUrl));
      pop(leading);
    }
  }

  async function close(li, id) {
    rows.delete(id);
    await exit(li);
    li.remove();
    onClose(id);
    moveIndicator();
  }

  function build(item) {
    const li = document.createElement("li");
    li.className = "k-list-item k-state k-type-label tab";
    li.dataset.id = item.id;
    const leading = document.createElement("span");
    leading.className = "k-list-item__leading";
    const label = document.createElement("span");
    label.className = "k-list-item__label";
    const audio = document.createElement("button");
    audio.className = "k-icon-button k-icon-button--small k-state tab__audio";
    audio.onclick = (e) => { e.stopPropagation(); onMute(li.item.id, li.item.audio !== "muted"); };
    const trailing = document.createElement("span");
    trailing.className = "k-list-item__trailing";
    const closeButton = document.createElement("button");
    closeButton.className = "k-icon-button k-icon-button--small k-state";
    closeButton.title = "Fechar";
    closeButton.innerHTML = `<span class="k-icon">${glyph("x")}</span>`;
    closeButton.onclick = (e) => { e.stopPropagation(); close(li, Number(li.dataset.id)); };
    trailing.append(closeButton);
    li.append(leading, label, audio, trailing);
    li.onclick = (e) => {
      if (li.dataset.dragged) {
        delete li.dataset.dragged;
        return;
      }
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        select(Number(li.dataset.id), e);
        return;
      }
      clearSelection();
      onActivate(Number(li.dataset.id));
    };
    li.onmousedown = (e) => { if (e.shiftKey || e.ctrlKey) e.preventDefault(); };
    label.ondblclick = (e) => { e.stopPropagation(); rename(Number(li.dataset.id)); };
    li.onpointerdown = (e) => {
      delete li.dataset.dragged;
      if (e.button !== 0 || e.target.closest("button, input")) return;
      drag = { li, startX: e.clientX, startY: e.clientY, active: false };
    };
    li.ondragstart = (e) => e.preventDefault();
    li.onauxclick = (e) => { if (e.button === 1) close(li, Number(li.dataset.id)); };
    li.oncontextmenu = (e) => {
      e.preventDefault();
      if (selected.size > 1 && selected.has(li.item.id)) return onContextMenu(li.item, e.clientX, e.clientY, selection());
      clearSelection();
      onContextMenu(li.item, e.clientX, e.clientY);
    };
    return li;
  }

  function update(li, item) {
    li.item = item;
    li.classList.toggle("k-list-item--active", item.active);
    li.classList.toggle("tab--asleep", item.asleep);
    if (!li.dataset.renaming) li.querySelector(".k-list-item__label").textContent = item.title;
    const audio = li.querySelector(".tab__audio");
    audio.hidden = !item.audio;
    audio.title = item.audio === "muted" ? "Ativar som" : "Silenciar";
    audio.classList.toggle("tab__audio--muted", item.audio === "muted");
    audio.innerHTML = item.audio ? `<span class="k-icon">${glyph(item.audio === "muted" ? "volume-x" : "volume-2")}</span>` : "";
    li.title = item.url;
    paintLeading(li, item);
  }

  function moveIndicator() {
    const active = list.querySelector(".k-list-item--active");
    if (!active) {
      indicator.style.opacity = "0";
      return;
    }
    const first = indicator.dataset.placed !== "1";
    if (first) indicator.style.transition = "none";
    indicator.style.opacity = "1";
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
    indicator.style.height = `${active.offsetHeight}px`;
    if (first) {
      indicator.dataset.placed = "1";
      void indicator.offsetHeight;
      indicator.style.transition = "";
    }
  }

  function render(items) {
    if (drag?.active) {
      pending = items;
      return;
    }
    const before = measure([...rows.values()]);
    const fresh = [];
    const next = items.map((item) => {
      let li = rows.get(item.id);
      if (!li) {
        li = build(item);
        rows.set(item.id, li);
        fresh.push(li);
      }
      update(li, item);
      return li;
    });
    const edges = splitEdges(items);
    next.forEach((li, i) => {
      li.dataset.split = edges[i];
      if (!edges[i]) delete li.dataset.split;
    });
    const keep = new Set(items.map((i) => i.id));
    for (const id of [...rows.keys()]) if (!keep.has(id)) rows.delete(id);
    for (const id of [...selected]) if (!keep.has(id)) selected.delete(id);
    if (selected.size < 2) selected.clear();
    if (next.length !== list.children.length || next.some((li, i) => list.children[i] !== li)) list.replaceChildren(...next);
    flip(before);
    fresh.forEach(enter);
    paintSelection();
    moveIndicator();
  }

  return { render, moveIndicator, selection, clearSelection, rename };
}
