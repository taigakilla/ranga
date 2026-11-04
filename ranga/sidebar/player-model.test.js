import test from "node:test";
import assert from "node:assert/strict";
import { pickSession, trackLive, visibleSessions, positionAt, clock, describe, shouldAutoPip, waveLayout, wavePoints } from "./player-model.js";

test("o player mostra a mídia de outra aba, a que toca primeiro", () => {
  const sessions = [{ tabId: 1, playing: false }, { tabId: 2, playing: true }, { tabId: 3, playing: true }];
  assert.equal(pickSession(sessions, 9, null).tabId, 2);
  assert.equal(pickSession(sessions, 2, null).tabId, 3);
  assert.equal(pickSession(sessions, 9, 3).tabId, 3);
  assert.equal(pickSession([{ tabId: 1, playing: false }], 1, null), null);
  assert.equal(pickSession([{ tabId: 1, playing: false }, { tabId: 4, playing: false }], 9, 4).tabId, 4);
});

test("pausar a mídia do player não troca pela outra que já tocava; uma que começa a tocar entra", () => {
  const before = [{ tabId: 1, playing: true }, { tabId: 2, playing: true }];
  const paused = [{ tabId: 1, playing: false }, { tabId: 2, playing: true }];
  assert.equal(pickSession(paused, 9, 1, before).tabId, 1);
  assert.equal(pickSession([{ tabId: 1, playing: false }, { tabId: 2, playing: false }], 9, 1, before).tabId, 1);
  assert.equal(pickSession([{ tabId: 1, playing: false }, { tabId: 2, playing: true }], 9, 1, [{ tabId: 1, playing: false }, { tabId: 2, playing: false }]).tabId, 2);
  assert.equal(pickSession([{ tabId: 2, playing: true }], 9, 1, before).tabId, 2);
});

test("ao vivo: sem fim, ou a duração crescendo junto com o relógio", () => {
  let history = new Map();
  const poll = (duration, at, extra = {}) => {
    const sessions = [{ tabId: 1, title: "Jogo", duration, ...extra }];
    history = trackLive(history, sessions, at);
    return sessions[0].live;
  };
  assert.equal(poll(1000, 0), false);
  assert.equal(poll(1001, 1000), false);
  assert.equal(poll(1002, 2000), true);
  assert.equal(poll(1002, 3000), true);
  assert.equal(poll(30, 4000), false);
  history = new Map();
  assert.equal(poll(120, 0), false);
  assert.equal(poll(120, 1000), false);
  assert.equal(poll(240, 2000), false);
  assert.equal(poll(240.4, 3000), false);
  assert.equal(poll(0, 0, { live: true }), true);
});

test("fechar o player esconde as mídias daquela hora até uma delas voltar a tocar", () => {
  const sessions = [{ tabId: 1, playing: false }, { tabId: 2, playing: false }];
  const dismissed = { tabs: [1, 2], at: 1000 };
  assert.deepEqual(visibleSessions(sessions, dismissed, 5000), []);
  assert.deepEqual(visibleSessions([{ tabId: 1, playing: true }], dismissed, 2500), []);
  assert.deepEqual(visibleSessions([{ tabId: 1, playing: true }], dismissed, 5000).map((s) => s.tabId), [1]);
  assert.deepEqual(visibleSessions([...sessions, { tabId: 7, playing: false }], dismissed, 5000).map((s) => s.tabId), [7]);
  assert.equal(visibleSessions(sessions, null, 0), sessions);
});

test("a posição anda com o tempo enquanto toca e para no fim", () => {
  const s = { duration: 100, position: 10, rate: 1, playing: true };
  assert.equal(positionAt(s, 5000), 15);
  assert.equal(positionAt({ ...s, playing: false }, 5000), 10);
  assert.equal(positionAt(s, 500000), 100);
  assert.equal(positionAt({ ...s, duration: 0 }, 5000), 0);
});

test("o relógio usa m:ss e h:mm:ss", () => {
  assert.equal(clock(5), "0:05");
  assert.equal(clock(125.7), "2:05");
  assert.equal(clock(3725), "1:02:05");
});

test("sem metadados o player usa o título da aba e o site", () => {
  assert.deepEqual(describe({ title: "", artist: "" }, { title: "Vídeo", url: "https://www.youtube.com/watch?v=1" }), { title: "Vídeo", subtitle: "youtube.com" });
  assert.deepEqual(describe({ title: "Música", artist: "Banda" }, { title: "x", url: "https://a.com" }), { title: "Música", subtitle: "Banda · a.com" });
});

test("só vira PiP a aba que deixou um vídeo tocando", () => {
  const sessions = [
    { tabId: 1, playing: true, actions: ["pause", "pip"] },
    { tabId: 2, playing: false, actions: ["play", "pip"] },
    { tabId: 3, playing: true, actions: ["pause"] },
  ];
  assert.equal(shouldAutoPip(sessions, 1), true);
  assert.equal(shouldAutoPip(sessions, 2), false);
  assert.equal(shouldAutoPip(sessions, 3), false);
  assert.equal(shouldAutoPip(sessions, 4), false);
});

test("a onda ocupa só o que já tocou, separada da trilha pelo marcador", () => {
  const layout = waveLayout({ width: 200, height: 24, fraction: 0.5, stroke: 4, thumbWidth: 4, gap: 4 });
  assert.equal(layout.head, 100);
  assert.equal(layout.end, 98);
  assert.equal(layout.rest, 108);
  assert.equal(layout.last, 198);
  assert.equal(waveLayout({ width: 200, height: 24, fraction: 0, stroke: 4, thumbWidth: 4, gap: 4 }).head, 4);
  assert.equal(waveLayout({ width: 200, height: 24, fraction: 1, stroke: 4, thumbWidth: 4, gap: 4 }).head, 198);
});

test("a onda afina nas pontas e fica reta quando para", () => {
  const layout = { begin: 2, end: 98, center: 12 };
  const points = wavePoints(layout, { length: 32, lift: 3, phase: 0.7 });
  assert.deepEqual(points[0], [2, 12]);
  assert.deepEqual(points.at(-1), [98, 12]);
  assert.ok(Math.abs(points[1][1] - 12) < 0.1);
  assert.ok(points.some(([, y]) => Math.abs(y - 12) > 2.5));
  assert.ok(wavePoints(layout, { length: 32, lift: 0, phase: 0.7 }).every(([, y]) => y === 12));
  assert.deepEqual(wavePoints({ begin: 2, end: 2, center: 12 }, { length: 32, lift: 3, phase: 0 }), []);
});
