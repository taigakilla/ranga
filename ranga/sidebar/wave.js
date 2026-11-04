import { reducedMotion } from "./motion.js";
import { waveLayout, wavePoints } from "./player-model.js";

const STROKE = 4;
const THUMB_WIDTH = 4;
const THUMB_HEIGHT = 18;
const GAP = 4;
const LENGTH = 32;
const LIFT = 3;
const PERIOD_MS = 1800;
const FADE_MS = 420;

export function setupWave(canvas, { canSeek, onSeek }) {
  const context = canvas.getContext("2d");
  let fraction = 0;
  let playing = false;
  let scrub = -1;
  let phase = 0;
  let amplitude = 0;
  let fade = null;
  let thumb = THUMB_HEIGHT;
  let frame = 0;
  let last = 0;

  function target() {
    return playing && scrub < 0 && !reducedMotion() ? 1 : 0;
  }

  function draw(now) {
    frame = 0;
    const elapsed = last ? now - last : 0;
    last = now;
    const goal = target();
    if (!fade || fade.to !== goal) fade = { from: amplitude, to: goal, at: now };
    const t = Math.min(1, (now - fade.at) / FADE_MS);
    amplitude = fade.from + (fade.to - fade.from) * (1 - (1 - t) ** 3);
    if (amplitude > 0) phase = (phase + elapsed * 2 * Math.PI / PERIOD_MS) % (2 * Math.PI);
    const tall = scrub >= 0 ? THUMB_HEIGHT * 1.4 : THUMB_HEIGHT;
    thumb += (tall - thumb) * Math.min(1, elapsed / 60);
    if (Math.abs(tall - thumb) < 0.2) thumb = tall;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const style = getComputedStyle(canvas);
    const active = style.getPropertyValue("--k-color-primary").trim();
    const track = style.getPropertyValue("--k-color-on-surface").trim();
    const layout = waveLayout({ width, height, fraction: scrub >= 0 ? scrub : fraction, stroke: STROKE, thumbWidth: THUMB_WIDTH, gap: GAP });
    context.lineCap = "round";
    context.lineJoin = "round";
    const points = wavePoints(layout, { length: LENGTH, lift: LIFT * amplitude, phase });
    if (points.length) {
      context.beginPath();
      context.moveTo(...points[0]);
      for (const point of points.slice(1)) context.lineTo(...point);
      context.strokeStyle = active;
      context.lineWidth = STROKE;
      context.stroke();
    }
    if (layout.rest < layout.last) {
      context.beginPath();
      context.moveTo(layout.rest, layout.center);
      context.lineTo(layout.last, layout.center);
      context.globalAlpha = 0.22;
      context.strokeStyle = track;
      context.lineWidth = STROKE * 0.8;
      context.stroke();
      context.globalAlpha = 1;
    }
    context.beginPath();
    context.roundRect(layout.head - THUMB_WIDTH / 2, layout.center - thumb / 2, THUMB_WIDTH, thumb, THUMB_WIDTH / 2);
    context.fillStyle = active;
    context.fill();

    if (amplitude > 0 || t < 1 || thumb !== tall) schedule();
    else last = 0;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function at(event) {
    const rect = canvas.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  canvas.onpointerdown = (event) => {
    if (!canSeek()) return;
    canvas.setPointerCapture(event.pointerId);
    scrub = at(event);
    schedule();
  };
  canvas.onpointermove = (event) => {
    if (scrub < 0) return;
    scrub = at(event);
    schedule();
  };
  canvas.onpointerup = () => {
    if (scrub < 0) return;
    fraction = scrub;
    scrub = -1;
    onSeek(fraction);
    schedule();
  };
  canvas.onpointercancel = () => {
    scrub = -1;
    schedule();
  };

  return {
    set(nextFraction, nextPlaying) {
      if (scrub < 0) fraction = nextFraction;
      playing = nextPlaying;
      schedule();
    },
  };
}
