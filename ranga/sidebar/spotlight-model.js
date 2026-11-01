import { toNavigation } from "./tabs-model.js";
import { rangaUrl } from "./settings-model.js";

export const COMMANDS = [
  { command: "newTabPage", title: "Nova aba", icon: "plus", words: "new tab pagina inicial", alias: "nt" },
  { command: "installPwa", title: "Instalar como app", icon: "app-window", words: "pwa aplicativo install" },
  { command: "openInApp", title: "Abrir no app", icon: "app-window", words: "pwa aplicativo" },
  { command: "createShortcut", title: "Criar atalho", icon: "external-link", words: "shortcut desktop app" },
  { command: "copyCleanLink", title: "Copiar link limpo", icon: "link", words: "url copiar rastreamento utm" },
  { command: "copyMarkdown", title: "Copiar como Markdown", icon: "file-text", words: "link markdown copiar" },
  { command: "pageInfo", title: "Informações do site", icon: "shield-check", words: "site permissoes cookies seguranca conexao certificado cadeado ruido fingerprinting" },
  { command: "screenshot", title: "Capturar tela", icon: "camera", words: "screenshot captura imagem foto" },
  { command: "qrCode", title: "QR code da página", icon: "qr-code", words: "qrcode criar compartilhar celular link" },
  { command: "print", title: "Imprimir", icon: "printer", words: "print pdf" },
  { command: "find", title: "Procurar na página", icon: "text-search", words: "localizar buscar find" },
  { command: "zoomIn", title: "Aumentar zoom", icon: "zoom-in", words: "zoom mais ampliar" },
  { command: "zoomOut", title: "Diminuir zoom", icon: "zoom-out", words: "zoom menos reduzir" },
  { command: "zoomReset", title: "Zoom padrão", icon: "search", words: "zoom normal 100" },
  { command: "savePage", title: "Salvar página", icon: "download", words: "save baixar" },
  { command: "viewSource", title: "Ver código-fonte", icon: "code", words: "source html" },
  { command: "devTools", title: "Ferramentas de desenvolvedor", icon: "code-xml", words: "devtools inspecionar console" },
  { command: "taskManager", title: "Gerenciador de tarefas", icon: "activity", words: "memoria processos task" },
  { command: "clearBrowsingData", title: "Limpar dados de navegação", icon: "trash-2", words: "cache cookies historico" },
  { command: "profiles", title: "Perfis", icon: "users", words: "profile perfil conta trocar" },
];

export function tabTitle(tab) {
  const title = tab.title || "";
  if (!title || title === tab.url || /^(chrome|chrome-extension):\/\//.test(title)) return rangaUrl(tab.url || "");
  return title;
}

function fold(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function matchCommands(query, enabled = []) {
  const terms = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!terms.length || terms.join(" ").length < 2) return [];
  return COMMANDS
    .filter((c) => enabled.includes(c.command))
    .filter((c) => {
      const words = fold(`${c.title} ${c.words} ${c.alias ?? ""}`).split(/[\s-]+/);
      return terms.every((t) => words.some((w) => w.startsWith(t)));
    })
    .map(({ words: _, alias, ...c }) => {
      const query = terms.join(" ");
      const title = fold(c.title);
      const exact = alias === query;
      const strong = exact || title.startsWith(query) || (query.length >= 4 && title.split(/[\s-]+/).some((w) => w.startsWith(terms[0])) && terms.every((t) => title.includes(t)));
      return { kind: "command", ...c, strong, exact };
    });
}

function matches(entry, q) {
  return `${entry.title ?? ""} ${entry.url ?? ""}`.toLowerCase().includes(q);
}

function score(entry, q, base) {
  const title = (entry.title ?? "").toLowerCase();
  const starts = title.startsWith(q) || title.includes(` ${q}`) ? 2 : 0;
  return base + starts + Math.min(entry.visitCount ?? 0, 50) / 50;
}

export function mayHaveKeyword(query) {
  return /\S\s+\S/.test(query);
}

function searchTitle(text, resolved) {
  if (resolved?.kind === "keyword" && resolved.engine && resolved.query) return `Buscar em ${resolved.engine}: “${resolved.query}”`;
  return `Buscar “${text}”`;
}

export const TOP = 5;
const SECTIONS = [["tab", "Abas", 4], ["bookmark", "Favoritos", 3], ["history", "Histórico", 4]];
const SCOPE_KIND = { tabs: "tab", bookmarks: "bookmark", history: "history" };

function entries(q, { tabs = [], bookmarks = [], history = [] }) {
  const pool = [
    ...tabs.filter((t) => !q || matches(t, q)).map((t) => ({ kind: "tab", title: tabTitle(t), url: t.url, tabId: t.id, windowId: t.windowId, score: score(t, q, 6) })),
    ...bookmarks.filter((b) => b.url && (!q || matches(b, q))).map((b) => ({ kind: "bookmark", title: b.title || b.url, url: b.url, score: score(b, q, 4) })),
    ...history.filter((h) => !q || matches(h, q)).map((h) => ({ kind: "history", title: h.title || h.url, url: h.url, score: score(h, q, 2) })),
  ];
  const sorted = q ? pool.sort((a, b) => b.score - a.score) : pool;
  const seen = new Set();
  const found = [];
  for (const entry of sorted) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    const { score: _, ...clean } = entry;
    found.push(clean);
  }
  return found;
}

function sectioned(found) {
  return SECTIONS.flatMap(([kind, title, max]) => {
    const rows = found.filter((e) => e.kind === kind).slice(0, max);
    return rows.length ? [{ kind: "header", title }, ...rows] : [];
  });
}

function hostOf(url) {
  try {
    const parsed = new URL(url);
    return /^https?:$/.test(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export function completeHost(query, { tabs = [], bookmarks = [], history = [] }) {
  const q = query.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (q.length < 2 || /[\s/]/.test(q)) return null;
  const hosts = new Map();
  const add = (url, weight) => {
    const parsed = hostOf(url);
    const host = parsed?.hostname.replace(/^www\./, "");
    if (!host?.startsWith(q)) return;
    const known = hosts.get(parsed.hostname) ?? { host, origin: parsed.origin, weight: 0 };
    known.weight += weight;
    hosts.set(parsed.hostname, known);
  };
  for (const h of history) add(h.url, 1 + Math.min(h.visitCount ?? 0, 50) + 5 * (h.typedCount ?? 0));
  for (const b of bookmarks) add(b.url, 10);
  for (const t of tabs) add(t.url, 10);
  const [best] = [...hosts.values()].sort((a, b) => b.weight - a.weight || a.host.length - b.host.length);
  return best ? { kind: "url", title: best.host, url: `${best.origin}/` } : null;
}

function suggestedRow(text) {
  const nav = toNavigation(text);
  if (nav.kind !== "url" || !hostOf(nav.url)) return { kind: "suggestion", title: text, text };
  return { kind: "url", title: text.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""), url: nav.url };
}

export function suggestions(query, { tabs = [], bookmarks = [], history = [], commands = [], resolved = null, suggested = [], hint = null }) {
  const text = query.trim();
  const q = text.toLowerCase();
  if (!q) return sectioned(entries("", { tabs: tabs.slice(0, 8) }));
  const nav = toNavigation(text);
  const first = nav.kind === "url"
    ? { kind: "url", title: nav.url, url: nav.url }
    : { kind: "search", title: searchTitle(text, resolved), text };
  const found = nav.kind === "url" ? [] : matchCommands(text, commands).slice(0, 3).map(({ strong, ...c }) => ({ ...c, strong }));
  const strong = found[0]?.strong ? [found.shift()] : [];
  const completion = nav.kind === "url" || strong[0]?.exact ? null : completeHost(text, { tabs, bookmarks, history });
  const same = (row) => completion && row.kind === "url" && hostOf(row.url)?.hostname.replace(/^www\./, "") === completion.title;
  const more = nav.kind === "url" ? [] : suggested.filter((s) => fold(s) !== fold(text)).map(suggestedRow).filter((row) => !same(row));
  const top = [...(completion ? [completion] : []), ...strong, first, ...(hint ? [hint] : []), ...found, ...more].slice(0, TOP).map(({ strong: _, exact: __, ...c }) => c);
  return [...top, ...sectioned(entries(q, { tabs, bookmarks, history }))];
}

export function scoped(scope, query, sources, max = 12) {
  const kind = SCOPE_KIND[scope];
  const q = query.trim().toLowerCase();
  const rows = entries(q, { [scope]: sources[scope] ?? [] }).filter((e) => e.kind === kind).slice(0, max);
  return rows;
}
