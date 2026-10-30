import { glyph } from "./kurobe/icons.mjs";
import { available, call } from "./ranga-private.js";
import { animate, kick, pop, reducedMotion } from "./motion.js";
import { faviconOf } from "./tabs-model.js";
import { pickSession, visibleSessions, positionAt, clock, describe } from "./player-model.js";

export function setupPlayer({ root, windowId, enabled }) {
  if (!available) return { refresh() {} };
  const $ = (selector) => root.querySelector(selector);
  const art = $(".player__art img");
  art.onerror = () => art.removeAttribute("src");
  const title = $(".player__title");
  const subtitle = $(".player__subtitle");
  const bar = $(".player__bar");
  const progress = $(".player__progress");
  const time = $(".player__time");
  const duration = $(".player__duration");
  const play = $(".player__play");
  const mute = $(".player__mute");
  let sessions = [];
  let fetchedAt = 0;
  let shown = null;
  let tab = null;
  let activeTabId = null;
  let timer = null;
  let frame = 0;
  let dismissed = null;

  function icon(button, name) {
    button.querySelector(".k-icon").textContent = glyph(name);
  }

  function action(name, seconds) {
    if (!shown) return;
    call("mediaAction", shown.tabId, name, seconds).catch(() => {}).finally(() => setTimeout(refresh, 150));
  }

  function tick() {
    cancelAnimationFrame(frame);
    if (!shown || root.hidden) return;
    const at = positionAt(shown, performance.now() - fetchedAt);
    bar.style.setProperty("--progress", shown.duration ? at / shown.duration : 0);
    time.textContent = shown.duration ? clock(at) : "";
    if (shown.playing && shown.duration) frame = requestAnimationFrame(tick);
  }

  function show(next) {
    if (Boolean(next) === !root.hidden) return;
    if (next) {
      root.hidden = false;
      animate(root, [{ opacity: 0, transform: "translateY(16px) scale(0.92)" }, { opacity: 1, transform: "none" }], "spatial-default");
    } else {
      const out = animate(root, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(16px) scale(0.92)" }], "spatial-fast");
      if (out) out.finished.then(() => { if (!shown) root.hidden = true; }).catch(() => {});
      else root.hidden = true;
    }
  }

  async function paint() {
    const next = enabled() ? pickSession(visibleSessions(sessions, dismissed, performance.now()), activeTabId, shown?.tabId) : null;
    const changed = next?.tabId !== shown?.tabId;
    shown = next;
    if (!shown) return show(false);
    tab = await chrome.tabs.get(shown.tabId).catch(() => null);
    if (!tab || shown?.tabId !== tab.id) return;
    const { title: name, subtitle: by } = describe(shown, tab);
    if (title.textContent !== name && !changed && !reducedMotion()) animate(title, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], "spatial-fast");
    title.textContent = name;
    title.title = name;
    subtitle.textContent = by;
    const src = faviconOf(tab) || "";
    if (!src) art.removeAttribute("src");
    else if (art.getAttribute("src") !== src) art.src = src;
    root.style.setProperty("--art", src ? `url("${src}")` : "none");
    const wasPlaying = root.classList.contains("player--playing");
    root.classList.toggle("player--playing", shown.playing);
    if (wasPlaying !== shown.playing && !changed) pop(play);
    icon(play, shown.playing ? "pause" : "play");
    play.title = shown.playing ? "Pausar" : "Tocar";
    play.disabled = !shown.actions.includes(shown.playing ? "pause" : "play");
    $(".player__prev").hidden = !shown.actions.includes("previous");
    $(".player__next").hidden = !shown.actions.includes("next");
    $(".player__pip").hidden = !shown.actions.includes("pip");
    const muted = Boolean(tab.mutedInfo?.muted);
    icon(mute, muted ? "volume-x" : "volume-2");
    mute.title = muted ? "Tirar do mudo" : "Silenciar";
    progress.hidden = !shown.duration;
    progress.classList.toggle("player__progress--seek", shown.actions.includes("seek"));
    duration.textContent = shown.duration ? clock(shown.duration) : "";
    show(true);
    tick();
  }

  async function refresh() {
    clearTimeout(timer);
    sessions = await call("getMediaSessions", windowId()).catch(() => []);
    fetchedAt = performance.now();
    await paint();
    timer = setTimeout(refresh, sessions.length ? 1000 : 4000);
  }

  play.onclick = () => action(shown?.playing ? "pause" : "play");
  $(".player__prev").onclick = (e) => { kick(e.currentTarget.querySelector(".k-icon"), "translateX(-6px)"); action("previous"); };
  $(".player__next").onclick = (e) => { kick(e.currentTarget.querySelector(".k-icon"), "translateX(6px)"); action("next"); };
  $(".player__pip").onclick = () => action("pip");
  $(".player__close").onclick = () => {
    if (!shown) return;
    if (shown.playing) call("mediaAction", shown.tabId, "pause").catch(() => {});
    dismissed = { tabs: sessions.map((s) => s.tabId), at: performance.now() };
    paint();
  };
  mute.onclick = async () => {
    if (!tab) return;
    pop(mute);
    await chrome.tabs.update(tab.id, { muted: !tab.mutedInfo?.muted }).catch(() => {});
    refresh();
  };
  $(".player__source").onclick = () => { if (shown) chrome.tabs.update(shown.tabId, { active: true }); };
  progress.onclick = (e) => {
    if (!shown?.duration || !shown.actions.includes("seek")) return;
    const rect = progress.getBoundingClientRect();
    action("seek", ((e.clientX - rect.left) / rect.width) * shown.duration);
  };

  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if ("audible" in info || "mutedInfo" in info || (tabId === shown?.tabId && ("title" in info || "favIconUrl" in info))) refresh();
  });
  chrome.tabs.onRemoved.addListener(() => refresh());
  chrome.tabs.onActivated.addListener((info) => {
    if (info.windowId !== windowId()) return;
    activeTabId = info.tabId;
    refresh();
  });
  chrome.tabs.query({ active: true, windowId: windowId() }).then(([t]) => { activeTabId = t?.id ?? null; refresh(); });

  return { refresh };
}
