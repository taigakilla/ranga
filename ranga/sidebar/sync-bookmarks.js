export const ROOTS = { "bookmarks-bar": "bar", other: "other", mobile: "mobile" };
const ORDER = ["bookmarks-bar", "other", "mobile"];

export function roots(tree) {
  const top = tree?.[0]?.children ?? [];
  const found = {};
  top.forEach((node, i) => {
    const type = node.folderType ?? ORDER[i];
    if (ROOTS[type] && !found[ROOTS[type]] && type !== "managed") found[ROOTS[type]] = node;
  });
  return found;
}

export function bookmarkItems(tree, ids, newSid) {
  const items = {};
  const next = { ...ids };
  const walk = (node, parent) => {
    if (!next[node.id]) next[node.id] = newSid();
    const sid = next[node.id];
    const children = node.children ?? [];
    items[sid] = node.url
      ? { parent, title: node.title ?? "", url: node.url }
      : { parent, title: node.title ?? "", order: children.map((c) => (next[c.id] ??= newSid())) };
    children.forEach((c) => walk(c, sid));
  };
  for (const [sid, node] of Object.entries(roots(tree))) {
    const children = node.children ?? [];
    items[sid] = { root: true, order: children.map((c) => (next[c.id] ??= newSid())) };
    children.forEach((c) => walk(c, sid));
  }
  for (const [sid, node] of Object.entries(roots(tree))) next[node.id] = sid;
  return { items, ids: next };
}

function keyOf(item) {
  return item.url ? `l|${item.url}|${item.title}` : `f|${item.title}`;
}

export function matchBookmarks(tree, remote) {
  const ids = {};
  const used = new Set();
  const remoteChildren = (sid) => (remote[sid]?.order ?? []).filter((c) => remote[c] && !remote[c].deleted);
  const walk = (node, sid) => {
    ids[node.id] = sid;
    const pool = remoteChildren(sid).filter((c) => !used.has(c));
    for (const child of node.children ?? []) {
      const key = keyOf({ title: child.title ?? "", url: child.url });
      const hit = pool.find((c) => !used.has(c) && keyOf(remote[c]) === key)
        ?? (child.url ? pool.find((c) => !used.has(c) && remote[c].url === child.url) : null);
      if (!hit) continue;
      used.add(hit);
      if (child.url) ids[child.id] = hit;
      else walk(child, hit);
    }
  };
  for (const [sid, node] of Object.entries(roots(tree))) if (remote[sid]) walk(node, sid);
  return ids;
}

function depth(items, sid) {
  let d = 0;
  for (let p = items[sid]?.parent; p && d < 64; p = items[p]?.parent) d++;
  return d;
}

export function planBookmarks(ids, values, set, remove) {
  const local = Object.fromEntries(Object.entries(ids).map(([id, sid]) => [sid, id]));
  const ops = [];
  for (const sid of remove) if (local[sid] && !Object.values(ROOTS).includes(sid)) ops.push({ op: "remove", sid, id: local[sid] });
  const all = { ...values, ...set };
  const sids = Object.keys(set).filter((sid) => !set[sid].root).sort((a, b) => depth(all, a) - depth(all, b));
  for (const sid of sids) {
    const item = set[sid];
    if (!local[sid]) ops.push({ op: "create", sid, parent: item.parent, title: item.title, url: item.url });
    else ops.push({ op: "update", sid, id: local[sid], parent: item.parent, title: item.title, url: item.url });
  }
  const folders = Object.keys(set).filter((sid) => set[sid].order);
  return { ops, folders };
}

export function orderMoves(current, desired) {
  const want = [...desired.filter((sid) => current.includes(sid)), ...current.filter((sid) => !desired.includes(sid))];
  const moves = [];
  const now = [...current];
  want.forEach((sid, index) => {
    if (now[index] === sid) return;
    now.splice(now.indexOf(sid), 1);
    now.splice(index, 0, sid);
    moves.push([sid, index]);
  });
  return moves;
}
