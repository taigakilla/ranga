import { glyph } from "./kurobe/icons.mjs";
import { available, call } from "./ranga-private.js";
import { animate, kick, pop, reducedMotion } from "./motion.js";
import { faviconOf } from "./tabs-model.js";
import { pickSession, trackLive, visibleSessions, positionAt, clock, describe } from "./player-model.js";
import { setupWave } from "./wave.js";

const LIVE_EDGE_S = 60;

export function setupPlayer({ root, windowId, enabled }) {
  if (!available) return { refresh() {} };
  const $ = (selector) => root.querySelector(selector);
  const art = $(".player__art img");
  art.onerror = () => art.removeAttribute("src");
  const cover = $(".player__cover");
  const artwork = $(".player__artwork");
  artwork.onload = () => { cover.hidden = false; root.classList.add("player--cover"); };
  artwork.onerror = () => { cover.hidden = true; root.classList.remove("player--cover"); };
  const title = $(".player__title");
  const subtitle = $(".player__subtitle");
  const progress = $(".player__progress");
  const time = $(".player__time");
  const duration = $(".player__duration");
  const play = $(".player__play");
  const mute = $(".player__mute");
  const live = $(".player__live");
  const compact = $(".player__compact");
  let sessions = [];
  let seen = [];
  let history = new Map();
  let running = false;
  let again = false;
  let fetchedAt = 0;
  let shown = null;
  let tab = null;
  let activeTabId = null;
  let timer = null;
  let frame = 0;
  let dismissed = null;
  const wave = setupWave($(".player__wave"), {
    canSeek: () => Boolean(shown?.duration && shown.actions.includes("seek")),
    onSeek: (fraction) => {
      if (!shown) return;
      shown.position = fraction * shown.duration;
      fetchedAt = performance.now();
      tick();
      action("seek", shown.position);
    },
  });

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
    const fraction = shown.duration ? at / shown.duration : shown.live ? 1 : 0;
    wave.set(fraction, shown.playing);
    root.style.setProperty("--played", String(fraction));
    time.textContent = shown.duration && !shown.live ? clock(at) : "";
    const behind = shown.live && shown.duration ? shown.duration - at : 0;
    duration.textContent = shown.live ? (behind > LIVE_EDGE_S ? `-${clock(behind)}` : "") : shown.duration ? clock(shown.duration) : "";
    live.classList.toggle("player__live--behind", behind > LIVE_EDGE_S);
    live.disabled = !(behind > LIVE_EDGE_S && shown.actions.includes("seek"));
    live.title = live.disabled ? "" : "Ir para o ao vivo";
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
    const visible = enabled() ? visibleSessions(sessions, dismissed, performance.now()) : [];
    const next = pickSession(visible, activeTabId, shown?.tabId, seen);
    seen = visible.filter((s) => s.tabId !== activeTabId);
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
    if (!shown.artwork) {
      artwork.removeAttribute("src");
      cover.hidden = true;
      root.classList.remove("player--cover");
    } else if (artwork.getAttribute("src") !== shown.artwork) artwork.src = shown.artwork;
    const tint = shown.artwork || src;
    root.style.setProperty("--art", tint ? `url("${tint}")` : "none");
    const wasPlaying = root.classList.contains("player--playing");
    root.classList.toggle("player--playing", shown.playing);
    if (wasPlaying !== shown.playing && !changed) pop(play);
    icon(play, shown.playing ? "pause" : "play");
    play.title = shown.playing ? "Pausar" : "Tocar";
    play.disabled = !shown.actions.includes(shown.playing ? "pause" : "play");
    $(".player__prev").hidden = !shown.actions.includes("previous");
    $(".player__next").hidden = !shown.actions.includes("next");
    const pip = $(".player__pip");
    pip.hidden = !shown.pip && !shown.actions.includes("pip");
    pip.setAttribute("aria-pressed", String(Boolean(shown.pip)));
    pip.title = shown.pip ? "Fechar picture-in-picture" : "Picture-in-picture";
    const muted = Boolean(tab.mutedInfo?.muted);
    icon(mute, muted ? "volume-x" : "volume-2");
    mute.title = muted ? "Tirar do mudo" : "Silenciar";
    progress.hidden = !shown.duration && !shown.live;
    $(".player__times").hidden = progress.hidden;
    progress.classList.toggle("player__progress--seek", Boolean(shown.duration) && shown.actions.includes("seek"));
    live.hidden = !shown.live;
    time.hidden = shown.live;
    root.classList.toggle("player--live", Boolean(shown.live));
    show(true);
    tick();
  }

  async function refresh() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    clearTimeout(timer);
    do {
      again = false;
      sessions = await call("getMediaSessions", windowId()).catch(() => []);
      fetchedAt = performance.now();
      history = trackLive(history, sessions, fetchedAt);
      await paint().catch(() => {});
    } while (again);
    running = false;
    timer = setTimeout(refresh, sessions.length ? 1000 : 4000);
  }

  function setCompact(next, animated) {
    const from = root.offsetHeight;
    root.classList.toggle("player--compact", next);
    icon(compact, next ? "maximize-2" : "minimize-2");
    compact.title = next ? "Expandir" : "Minimizar";
    if (animated && !root.hidden) animate(root, [{ height: `${from}px` }, { height: `${root.offsetHeight}px` }], "spatial-default");
  }
  compact.onclick = () => {
    const next = !root.classList.contains("player--compact");
    setCompact(next, true);
    chrome.storage.local.set({ playerCompact: next });
  };
  chrome.storage.local.get("playerCompact").then(({ playerCompact }) => setCompact(Boolean(playerCompact), false));
  live.onclick = () => {
    if (!shown?.duration) return;
    pop(live);
    shown.position = shown.duration;
    fetchedAt = performance.now();
    tick();
    action("seek", shown.duration);
  };

  play.onclick = () => action(shown?.playing ? "pause" : "play");
  $(".player__prev").onclick = (e) => { kick(e.currentTarget.querySelector(".k-icon"), "translateX(-6px)"); action("previous"); };
  $(".player__next").onclick = (e) => { kick(e.currentTarget.querySelector(".k-icon"), "translateX(6px)"); action("next"); };
  $(".player__pip").onclick = (e) => { pop(e.currentTarget); action(shown?.pip ? "exitPip" : "pip"); };
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
  function goToTab() {
    if (!shown) return;
    chrome.tabs.update(shown.tabId, { active: true });
    if (shown.pip) call("mediaAction", shown.tabId, "exitPip").catch(() => {});
  }
  $(".player__source").onclick = goToTab;
  cover.onclick = goToTab;

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
