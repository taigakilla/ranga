export function pickSession(sessions, activeTabId, lastTabId, before = sessions) {
  const shown = sessions.filter((s) => s.tabId !== activeTabId);
  const started = shown.find((s) => s.playing && s.tabId !== lastTabId && !before.some((b) => b.tabId === s.tabId && b.playing));
  return started || shown.find((s) => s.tabId === lastTabId) || shown.find((s) => s.playing) || shown[0] || null;
}

export function trackLive(history, sessions, now) {
  const next = new Map();
  for (const s of sessions) {
    const was = history.get(s.tabId);
    let streak = 0;
    if (was && s.duration && was.duration && s.title === was.title) {
      const grew = s.duration - was.duration;
      const elapsed = (now - was.at) / 1000;
      if (grew >= 0) streak = grew > 0.3 * elapsed && grew <= 3 * elapsed + 1 ? was.streak + 1 : was.streak;
    }
    next.set(s.tabId, { duration: s.duration, at: now, title: s.title, streak });
    s.live = Boolean(s.live) || streak >= 2;
  }
  return next;
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
    subtitle: [session.artist || session.album, host].filter(Boolean).join(" · "),
  };
}

export function shouldAutoPip(sessions, tabId) {
  return sessions.some((s) => s.tabId === tabId && s.playing && s.actions.includes("pip"));
}

function smooth(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function waveLayout({ width, height, fraction, stroke, thumbWidth, gap }) {
  const head = Math.max(stroke / 2 + thumbWidth / 2, Math.min(width - thumbWidth / 2, fraction * width));
  return {
    center: height / 2,
    head,
    begin: stroke / 2,
    end: head - thumbWidth / 2,
    rest: head + thumbWidth / 2 + gap + stroke / 2,
    last: width - stroke / 2,
  };
}

export function wavePoints({ begin, end, center }, { length, lift, phase }) {
  if (end <= begin) return [];
  const ramp = length / 2;
  const points = [[begin, center]];
  for (let x = begin + 1; x < end; x += 1) {
    const envelope = smooth((x - begin) / ramp) * smooth((end - x) / ramp);
    points.push([x, center + lift * envelope * Math.sin(2 * Math.PI * (x - begin) / length - phase)]);
  }
  points.push([end, center]);
  return points;
}
