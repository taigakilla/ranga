export const MAX_DEFAULT_PINS = 4;

export function others(actions, ownId) {
  return actions
    .filter((a) => a.id !== ownId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

export function pinnedIds(stored, actions) {
  if (Array.isArray(stored)) return stored;
  return actions.slice(0, MAX_DEFAULT_PINS).map((a) => a.id);
}

export function pinnedActions(actions, ids) {
  const byId = new Map(actions.map((a) => [a.id, a]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function togglePin(ids, id) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function extensionRows(actions, installed, ownId) {
  const rows = new Map(actions.map((a) => [a.id, { id: a.id, name: a.name, icon: a.icon, pinnable: true }]));
  for (const e of installed) {
    if (e.type !== "extension" || !e.mayDisable) continue;
    const row = rows.get(e.id) ?? { id: e.id, name: e.name, icon: e.icons?.at(-1)?.url, pinnable: false };
    rows.set(e.id, { ...row, enabled: e.enabled });
  }
  return others([...rows.values()], ownId);
}
