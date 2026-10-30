export function pickSession(sessions, activeTabId, lastTabId) {
  const shown = sessions.filter((s) => s.tabId !== activeTabId);
  return shown.find((s) => s.playing && s.tabId === lastTabId) || shown.find((s) => s.playing) || shown.find((s) => s.tabId === lastTabId) || shown[0] || null;
}

export const DISMISS_GRACE_MS = 2000;

export function visibleSessions(sessions, dismissed, now) {
  if (!dismissed) return sessions;
  return sessions.filter((s) => !dismissed.tabs.includes(s.tabId) || (s.playing && now - dismissed.at > DISMISS_GRACE_MS));
}

export function positionAt(session, elapsedMs) {
  if (!session?.duration) return 0;
  const moved = session.playing ? (session.rate || 1) * elapsedMs / 1000 : 0;
  return Math.min(session.duration, Math.max(0, session.position + moved));
}

export function clock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function describe(session, tab) {
  const host = (() => { try { return new URL(tab?.url || "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
  return {
    title: session.title || tab?.title || host,
    subtitle: session.artist || session.album || host,
  };
}

export function shouldAutoPip(sessions, tabId) {
  return sessions.some((s) => s.tabId === tabId && s.playing && s.actions.includes("pip"));
}
