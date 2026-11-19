export function pinId(prefix, now = Date.now(), random = Math.random()) {
  return `${prefix}-${now.toString(36)}${Math.floor(random * 1296).toString(36).padStart(2, "0")}`;
}

export function find(tree, id) {
  for (const node of tree) {
    if (node.id === id) return node;
    const inner = node.children?.find((c) => c.id === id);
    if (inner) return inner;
  }
  return null;
}

export function parentOf(tree, id) {
  return tree.find((node) => node.children?.some((c) => c.id === id)) ?? null;
}

export function links(tree) {
  return tree.flatMap((node) => (node.kind === "folder" ? node.children : [node]));
}

function detach(tree, id) {
  return tree
    .filter((node) => node.id !== id)
    .map((node) => (node.children ? { ...node, children: node.children.filter((c) => c.id !== id) } : node));
}

function insert(list, node, index) {
  const at = index == null ? list.length : Math.max(0, Math.min(list.length, index));
  return [...list.slice(0, at), node, ...list.slice(at)];
}

export function addLink(tree, { id, url, title }, parentId = null, index = null) {
  const link = { id, kind: "link", url, title: title || url };
  if (!parentId) return insert(tree, link, index);
  return tree.map((node) => (node.id === parentId ? { ...node, open: true, children: insert(node.children, link, index) } : node));
}

export function addFolder(tree, { id, title }) {
  return [...tree, { id, kind: "folder", title: title || "Pasta", open: true, children: [] }];
}

export function remove(tree, id) {
  const index = tree.findIndex((node) => node.id === id);
  if (index >= 0 && tree[index].kind === "folder") {
    return [...tree.slice(0, index), ...tree[index].children, ...tree.slice(index + 1)];
  }
  return detach(tree, id);
}

function patch(tree, id, change) {
  return tree.map((node) => {
    if (node.id === id) return { ...node, ...change };
    if (!node.children?.some((c) => c.id === id)) return node;
    return { ...node, children: node.children.map((c) => (c.id === id ? { ...c, ...change } : c)) };
  });
}

export function rename(tree, id, title) {
  const clean = (title ?? "").trim();
  return clean ? patch(tree, id, { title: clean }) : tree;
}

export function setUrl(tree, id, url, title) {
  return patch(tree, id, title ? { url, title } : { url });
}

export function toggle(tree, id) {
  const node = find(tree, id);
  return node?.kind === "folder" ? patch(tree, id, { open: !node.open }) : tree;
}

export function move(tree, id, parentId = null, index = null) {
  const node = find(tree, id);
  if (!node || (node.kind === "folder" && parentId)) return tree;
  const rest = detach(tree, id);
  if (!parentId) return insert(rest, node, index);
  if (!rest.some((n) => n.id === parentId && n.kind === "folder")) return tree;
  return rest.map((n) => (n.id === parentId ? { ...n, children: insert(n.children, node, index) } : n));
}

export function place(tree, id, targetId) {
  const node = find(tree, id);
  if (!node || id === targetId) return tree;
  const parent = parentOf(tree, targetId);
  if (node.kind === "folder" && parent) return tree;
  const siblings = parent ? parent.children : tree;
  const to = siblings.findIndex((n) => n.id === targetId);
  return to < 0 ? tree : move(tree, id, parent?.id ?? null, to);
}

function comparable(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url ?? "";
  }
}

export function drifted(saved, live) {
  return Boolean(live) && comparable(saved) !== comparable(live);
}

export function prune(live, tabIds, nodeIds) {
  return Object.fromEntries(Object.entries(live).filter(([tab, node]) => tabIds.has(Number(tab)) && nodeIds.has(node)));
}

export function tabOf(live, nodeId, here = null) {
  const entry = Object.entries(live).find(([tab, node]) => node === nodeId && (!here || here.has(Number(tab))));
  return entry ? Number(entry[0]) : null;
}

export function forgetNode(live, nodeId) {
  return Object.fromEntries(Object.entries(live).filter(([, node]) => node !== nodeId));
}

export function pinSnapshot(live, tabs) {
  return tabs.filter((t) => live[t.id]).map((t) => ({ url: t.url || t.pendingUrl || "", pin: live[t.id] }));
}

export function restoreLive(tabs, shot, nodeIds) {
  const pending = (shot ?? []).filter((entry) => nodeIds.has(entry.pin));
  const live = {};
  for (const tab of tabs) {
    if (tab.pinned) continue;
    const url = tab.url || tab.pendingUrl || "";
    const i = pending.findIndex((entry) => entry.url === url);
    if (i < 0) continue;
    live[tab.id] = pending[i].pin;
    pending.splice(i, 1);
  }
  return live;
}
