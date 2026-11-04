export const CONTAINER_COLORS = ["#71b1ec", "#7cc2a8", "#d9c08a", "#d49a78", "#d8737a", "#b59ad4"];
export const CONTAINER_ICONS = ["briefcase", "user", "shopping-cart", "landmark", "gamepad-2", "heart", "fingerprint", "graduation-cap"];
export const DEFAULT_CONTAINERS = Object.freeze([
  { id: "trabalho", name: "Trabalho", color: "#71b1ec", icon: "briefcase" },
  { id: "pessoal", name: "Pessoal", color: "#7cc2a8", icon: "user" },
]);

const ID = /^[a-z0-9-]{1,40}$/;

function valid(c) {
  return c && ID.test(c.id) && typeof c.name === "string" && c.name.trim() && typeof c.color === "string" && typeof c.icon === "string";
}

export function loadContainers(stored) {
  if (!Array.isArray(stored)) return DEFAULT_CONTAINERS.map((c) => ({ ...c }));
  return stored.filter(valid);
}

export function slug(name) {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "container";
}

export function createContainer(list, { name, color, icon }) {
  const clean = (name ?? "").trim().slice(0, 32);
  if (!clean) throw new Error("nome vazio");
  const base = slug(clean);
  let id = base;
  for (let n = 2; list.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return [...list, { id, name: clean, color: color ?? CONTAINER_COLORS[list.length % CONTAINER_COLORS.length], icon: icon ?? CONTAINER_ICONS[0] }];
}

export function updateContainer(list, id, patch) {
  return list.map((c) => {
    if (c.id !== id) return c;
    const name = patch.name === undefined ? c.name : patch.name.trim().slice(0, 32);
    return { ...c, ...patch, name: name || c.name, id: c.id };
  });
}

export function deleteContainer(list, id) {
  return list.filter((c) => c.id !== id);
}

export function membership(entries) {
  return new Map((entries ?? []).filter((e) => e.container).map((e) => [e.tabId, e.container]));
}

export function pagesOf(container) {
  return Array.isArray(container?.pages) ? container.pages : [];
}

export function addPage(list, containerId, page, index = null) {
  return list.map((c) => {
    if (c.id !== containerId) return c;
    const pages = pagesOf(c).filter((p) => p.id !== page.id);
    const at = index == null ? pages.length : Math.max(0, Math.min(pages.length, index));
    return { ...c, pages: [...pages.slice(0, at), { id: page.id, url: page.url, title: page.title || page.url }, ...pages.slice(at)] };
  });
}

export function removePage(list, pageId) {
  return list.map((c) => (pagesOf(c).some((p) => p.id === pageId) ? { ...c, pages: pagesOf(c).filter((p) => p.id !== pageId) } : c));
}

export function updatePage(list, pageId, patch) {
  return list.map((c) => (pagesOf(c).some((p) => p.id === pageId)
    ? { ...c, pages: pagesOf(c).map((p) => (p.id === pageId ? { ...p, ...patch, id: p.id } : p)) }
    : c));
}

export function pageTitle(page, { custom = "", bookmark = "", live = "" } = {}) {
  const saved = page.title && page.title !== page.url ? page.title : "";
  return custom || saved || bookmark || live || page.url;
}

export function findPage(list, pageId) {
  for (const container of list) {
    const page = pagesOf(container).find((p) => p.id === pageId);
    if (page) return { container, page };
  }
  return null;
}

export function toggleGroup(list, containerId) {
  return list.map((c) => (c.id === containerId ? { ...c, collapsed: !c.collapsed } : c));
}

export function pageIds(list) {
  return new Set(list.flatMap((c) => pagesOf(c).map((p) => p.id)));
}

export function restorePages(tabs, shot, list) {
  const live = {};
  const used = new Set();
  for (const entry of shot ?? []) {
    const found = findPage(list, entry.pin);
    if (!found) continue;
    const tab = tabs.find((t) => !used.has(t.id) && (t.url || t.pendingUrl || "") === entry.url);
    if (!tab) continue;
    used.add(tab.id);
    live[tab.id] = entry.pin;
  }
  return live;
}
