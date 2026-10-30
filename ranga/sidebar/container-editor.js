import { glyph } from "./kurobe/icons.mjs";
import { pop } from "./motion.js";
import { iconChoices } from "./icons-model.js";
import { loadContainers, createContainer, updateContainer, deleteContainer, CONTAINER_COLORS } from "./containers-model.js";

function icon(name) {
  return Object.assign(document.createElement("span"), { className: "k-icon", textContent: glyph(name) });
}

export function setupContainerEditor({ popover }) {
  const title = popover.querySelector(".containers-title");
  const back = popover.querySelector(".favorites-back");
  const listView = popover.querySelector(".containers-list-view");
  const list = popover.querySelector(".containers-list");
  const create = popover.querySelector(".containers-new");
  const edit = popover.querySelector(".containers-edit");
  const name = edit.elements.name;
  const icons = edit.querySelector(".icons");
  const colors = edit.querySelector(".colors");
  let containers = [];
  let editing = null;

  async function load() {
    containers = loadContainers((await chrome.storage.local.get("containers")).containers);
  }

  async function save(next) {
    containers = next;
    await chrome.storage.local.set({ containers });
  }

  function showList() {
    editing = null;
    title.textContent = "Grupos";
    back.hidden = true;
    edit.hidden = true;
    listView.hidden = false;
    list.replaceChildren(...containers.map((c) => {
      const li = document.createElement("li");
      li.className = "k-list-item k-state k-type-label";
      li.style.setProperty("--container-color", c.color);
      const leading = document.createElement("span");
      leading.className = "k-list-item__leading container-swatch";
      leading.append(icon(c.icon));
      const label = Object.assign(document.createElement("span"), { className: "k-list-item__label", textContent: c.name });
      const trailing = document.createElement("span");
      trailing.className = "k-list-item__trailing";
      trailing.append(icon("chevron-right"));
      li.append(leading, label, trailing);
      li.onclick = () => showEdit(c.id);
      return li;
    }));
    if (!containers.length) list.append(Object.assign(document.createElement("li"), { className: "favorites-empty k-type-caption", textContent: "Nenhum grupo." }));
  }

  function pick(group, button) {
    for (const x of group.children) x.setAttribute("aria-pressed", String(x === button));
    pop(button);
  }

  function showEdit(id) {
    const c = containers.find((x) => x.id === id);
    if (!c) return showList();
    editing = id;
    title.textContent = c.name;
    back.hidden = false;
    listView.hidden = true;
    edit.hidden = false;
    name.value = c.name;
    icons.replaceChildren(...iconChoices(c.icon).map((value) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice k-state";
      b.title = value;
      b.append(icon(value));
      b.setAttribute("aria-pressed", String(value === c.icon));
      b.onclick = () => { pick(icons, b); save(updateContainer(containers, id, { icon: value })); };
      return b;
    }));
    colors.replaceChildren(...CONTAINER_COLORS.map((value) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch k-state";
      b.title = value;
      b.style.background = value;
      b.setAttribute("aria-pressed", String(value === c.color));
      b.onclick = () => { pick(colors, b); save(updateContainer(containers, id, { color: value })); };
      return b;
    }));
    icons.querySelector("[aria-pressed=true]")?.scrollIntoView({ block: "nearest" });
  }

  async function rename() {
    if (!editing || !name.value.trim()) return;
    await save(updateContainer(containers, editing, { name: name.value }));
    title.textContent = containers.find((c) => c.id === editing)?.name ?? "";
  }

  function close() {
    if (popover.hidden) return;
    rename();
    popover.hidden = true;
  }

  name.addEventListener("change", rename);
  edit.addEventListener("submit", (e) => { e.preventDefault(); rename(); });
  back.onclick = async () => { await rename(); showList(); };
  edit.querySelector(".containers-delete").onclick = async () => {
    await save(deleteContainer(containers, editing));
    showList();
  };
  create.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = create.elements.name;
    try {
      await save(createContainer(containers, { name: input.value }));
      input.value = "";
      showEdit(containers.at(-1).id);
    } catch {
      input.focus();
    }
  });
  popover.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  popover.addEventListener("dismiss", close);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.containers || popover.hidden) return;
    containers = loadContainers(changes.containers.newValue);
    if (!editing) showList();
  });

  return {
    async open(id) {
      await load();
      if (id) showEdit(id);
      else showList();
      popover.hidden = false;
    },
  };
}
