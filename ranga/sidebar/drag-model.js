const EDGES = "left,right,top,bottom";

export function windowAt(pointer, windows) {
  return windows.find((w) => pointer.x >= w.x && pointer.x < w.x + w.width && pointer.y >= w.y && pointer.y < w.y + w.height) ?? null;
}

export function chromeWindowFor(found, windows) {
  const matches = windows.filter((w) => `${w.title} - Ranga` === found.title);
  return matches.length === 1 ? matches[0] : null;
}

export function partnerFor(dragged, tabs) {
  const active = tabs.find((t) => t.active) ?? null;
  if (!dragged || !active) return null;
  if (active.splitViewId > 0) {
    if (dragged.splitViewId !== active.splitViewId) return null;
    return tabs.find((t) => t.splitViewId === active.splitViewId && t.id !== dragged.id) ?? null;
  }
  if (active.id !== dragged.id) return active;
  return tabs
    .filter((t) => t.id !== dragged.id && !(t.splitViewId > 0) && t.pinned === dragged.pinned)
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

export function zonesFor({ dragged, partner, own }) {
  if (own) return !dragged || !partner || partner.id === dragged.id ? "window" : `${EDGES},window`;
  return !partner || partner.splitViewId > 0 ? "join" : `${EDGES},join`;
}
