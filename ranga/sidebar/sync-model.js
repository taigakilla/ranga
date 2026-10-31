import { deleteSpace } from "./spaces-model.js";

export const STALE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_TABS = 200;

export function shareable(url) {
  return /^https?:\/\//.test(url ?? "");
}

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deviceTabs(tabs, spaceName = () => "") {
  return tabs
    .filter((t) => !t.incognito && shareable(t.url || t.pendingUrl))
    .slice(0, MAX_TABS)
    .map((t) => ({ url: t.url || t.pendingUrl, title: t.title || "", space: spaceName(t) }));
}

export function otherDevices(docs, selfId, now = Date.now()) {
  return docs
    .filter((d) => d && d.id !== selfId && now - (d.at ?? 0) < STALE_MS)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export function track(ledger, items, now = Date.now()) {
  const next = {};
  for (const [id, value] of Object.entries(items)) {
    const hash = stable(value);
    const old = ledger?.[id];
    next[id] = old && !old.deleted && !old.detached && old.hash === hash ? old : { at: now, hash, value };
  }
  for (const [id, old] of Object.entries(ledger ?? {})) {
    if (id in next) continue;
    if (old.deleted || old.detached) {
      if (now - old.at < STALE_MS) next[id] = old;
      continue;
    }
    next[id] = { at: now, deleted: true };
  }
  return next;
}

export function detach(ledger, ids, now = Date.now()) {
  const next = { ...ledger };
  for (const id of ids) if (next[id] && !next[id].deleted && !next[id].detached) next[id] = { at: now, detached: true };
  return next;
}

function newer(a, b) {
  return a.entry.at > b.entry.at || (a.entry.at === b.entry.at && a.device > b.device);
}

export function merge(sources) {
  const best = {};
  for (const { device, ledger } of sources) {
    for (const [id, entry] of Object.entries(ledger ?? {})) {
      const candidate = { device, entry };
      if (!best[id] || newer(candidate, best[id])) best[id] = candidate;
    }
  }
  return Object.fromEntries(Object.entries(best).map(([id, { entry }]) => [id, entry]));
}

export function resolve(local, merged) {
  const set = {};
  const remove = [];
  const detached = [];
  const ledger = { ...local };
  for (const [id, entry] of Object.entries(merged)) {
    const mine = local?.[id];
    if (mine && mine.at >= entry.at) continue;
    ledger[id] = entry;
    if (entry.deleted) remove.push(id);
    else if (entry.detached) detached.push(id);
    else {
      set[id] = entry.value;
    }
  }
  return { set, remove, detached, ledger };
}

function withoutUiState(tree) {
  return (tree ?? []).map(({ open, ...node }) => (node.children ? { ...node, children: withoutUiState(node.children) } : node));
}

export function containerItems(list) {
  return Object.fromEntries(list.map(({ collapsed, ...c }, order) => [c.id, { ...c, order }]));
}

export function applyContainers(list, { set, remove }) {
  const removed = new Set(remove);
  const byId = new Map(list.filter((c) => !removed.has(c.id)).map((c) => [c.id, c]));
  for (const [id, { order, ...value }] of Object.entries(set)) byId.set(id, { ...value, id, ...(byId.get(id)?.collapsed ? { collapsed: true } : {}) });
  const orderOf = (c) => set[c.id]?.order ?? list.findIndex((l) => l.id === c.id);
  return [...byId.values()].sort((a, b) => orderOf(a) - orderOf(b));
}

export function spaceItems(state, pins) {
  return Object.fromEntries(state.spaces
    .map((s, order) => [s, order])
    .filter(([s]) => s.sync)
    .map(([s, order]) => [s.id, { name: s.name, icon: s.icon, color: s.color ?? null, order, pins: withoutUiState(pins?.[s.id]) }]));
}

function urlsOf(tree) {
  return new Set((tree ?? []).flatMap((node) => (node.children ? node.children.map((c) => c.url) : [node.url])));
}

export function unionPins(remote, local) {
  const known = urlsOf(remote);
  const extra = (local ?? []).flatMap((node) => {
    if (!node.children) return known.has(node.url) ? [] : [node];
    const children = node.children.filter((c) => !known.has(c.url));
    return children.length ? [{ ...node, children }] : [];
  });
  return [...(remote ?? []), ...extra];
}

export function applySpaces(state, pins, { set, remove, detached }) {
  let next = { ...state, spaces: state.spaces.map((s) => (detached.includes(s.id) ? { ...s, sync: false } : s)) };
  const nextPins = { ...pins };
  for (const [id, { name, icon, color, pins: tree }] of Object.entries(set)) {
    const existing = next.spaces.find((s) => s.id === id);
    const spaces = existing
      ? next.spaces.map((s) => (s.id === id ? { ...s, name, icon, color, sync: true } : s))
      : [...next.spaces, { id, name, icon, color, session: id, sync: true }];
    next = { ...next, spaces };
    nextPins[id] = existing && !existing.sync ? unionPins(tree, pins?.[id]) : tree;
  }
  for (const id of remove) {
    if (!next.spaces.some((s) => s.id === id && s.sync) || next.spaces.length <= 1) continue;
    next = deleteSpace(next, id);
    delete nextPins[id];
  }
  return { state: next, pins: nextPins };
}

export function inboxName(target, id) {
  return `inbox-${target}-${id}`;
}

export function inboxTarget(name) {
  return /^inbox-([0-9a-f]+)-[0-9a-f]+$/.exec(name)?.[1] ?? null;
}

export function deviceOf(name) {
  return /^device-([0-9a-f]+)$/.exec(name)?.[1] ?? null;
}

function fold(text) {
  return String(text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function remoteMatches(devices, query, max = 5) {
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const rows = (devices ?? [])
    .flatMap((d) => d.tabs.map((t) => ({ kind: "remote", title: t.title || t.url, url: t.url, device: d.name })))
    .filter((r) => terms.every((term) => fold(`${r.title} ${r.url}`).includes(term)))
    .slice(0, max);
  return rows.length ? [{ kind: "header", title: "Outros aparelhos" }, ...rows] : [];
}

export const MAX_HISTORY = 500;

export function deviceHistory(items) {
  return items
    .filter((h) => shareable(h.url))
    .map((h) => ({ url: h.url, title: h.title || "", at: h.lastVisitTime ?? 0 }))
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_HISTORY);
}

export function mergeHistory(lists, max = 1000) {
  const byUrl = new Map();
  for (const { device, items } of lists) {
    for (const item of items ?? []) {
      const old = byUrl.get(item.url);
      if (!old || old.at < item.at) byUrl.set(item.url, { ...item, device });
    }
  }
  return [...byUrl.values()].sort((a, b) => b.at - a.at).slice(0, max);
}

export function remoteHistoryMatches(history, query, skip = [], max = 5) {
  const terms = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const known = new Set(skip);
  const rows = (history ?? [])
    .filter((h) => !known.has(h.url) && terms.every((term) => fold(`${h.title} ${h.url}`).includes(term)))
    .slice(0, max)
    .map((h) => ({ kind: "remote", title: h.title || h.url, url: h.url, device: h.device }));
  return rows.length ? [{ kind: "header", title: "Histórico de outros aparelhos" }, ...rows] : [];
}

export function deviceExtensions(list, self) {
  return list
    .filter((e) => e.type === "extension" && e.installType === "normal" && e.id !== self)
    .map((e) => ({ id: e.id, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function missingExtensions(devices, installed) {
  const have = new Set(installed);
  const found = new Map();
  for (const device of devices ?? []) {
    for (const ext of device.extensions ?? []) {
      if (have.has(ext.id)) continue;
      const entry = found.get(ext.id) ?? { id: ext.id, name: ext.name, devices: [] };
      entry.devices.push(device.name);
      found.set(ext.id, entry);
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
