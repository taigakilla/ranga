export function ago(at, now = Date.now()) {
  if (!at) return "";
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 24 * 60) return `há ${Math.floor(minutes / 60)} h`;
  return new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function deviceBlocks(devices, now = Date.now()) {
  return (devices ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    when: ago(d.at, now),
    tabs: (d.tabs ?? []).map((t) => ({ url: t.url, title: t.title || hostOf(t.url), host: hostOf(t.url) })),
  }));
}
