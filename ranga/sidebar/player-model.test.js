import test from "node:test";
import assert from "node:assert/strict";
import { pickSession, visibleSessions, positionAt, clock, describe, shouldAutoPip } from "./player-model.js";

test("o player mostra a mídia de outra aba, a que toca primeiro", () => {
  const sessions = [{ tabId: 1, playing: false }, { tabId: 2, playing: true }, { tabId: 3, playing: true }];
  assert.equal(pickSession(sessions, 9, null).tabId, 2);
  assert.equal(pickSession(sessions, 2, null).tabId, 3);
  assert.equal(pickSession(sessions, 9, 3).tabId, 3);
  assert.equal(pickSession([{ tabId: 1, playing: false }], 1, null), null);
  assert.equal(pickSession([{ tabId: 1, playing: false }, { tabId: 4, playing: false }], 9, 4).tabId, 4);
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
  assert.deepEqual(describe({ title: "Música", artist: "Banda" }, { title: "x", url: "https://a.com" }), { title: "Música", subtitle: "Banda" });
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
