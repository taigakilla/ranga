import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, hostOf, deviceBlocks } from "./devices-model.js";

const now = Date.UTC(2026, 9, 31, 15, 0);

test("tempo desde o último sync", () => {
  assert.equal(ago(now - 20_000, now), "agora");
  assert.equal(ago(now - 5 * 60_000, now), "há 5 min");
  assert.equal(ago(now - 3 * 3_600_000, now), "há 3 h");
  assert.match(ago(now - 3 * 86_400_000, now), /^\d{2}\/\d{2},? \d{2}:\d{2}$/);
  assert.equal(ago(0, now), "");
});

test("domínio sem www e URL inválida volta como está", () => {
  assert.equal(hostOf("https://www.example.com/a?b"), "example.com");
  assert.equal(hostOf("nada"), "nada");
});

test("um bloco por aparelho, com título de reserva no domínio", () => {
  const blocks = deviceBlocks([{ id: "a", name: "Notebook", at: now - 120_000, tabs: [
    { url: "https://mdn.io/", title: "MDN" },
    { url: "https://www.example.com/x", title: "" },
  ] }], now);
  assert.deepEqual(blocks, [{ id: "a", name: "Notebook", when: "há 2 min", tabs: [
    { url: "https://mdn.io/", title: "MDN", host: "mdn.io" },
    { url: "https://www.example.com/x", title: "example.com", host: "example.com" },
  ] }]);
});

test("sem aparelhos ou sem abas não quebra", () => {
  assert.deepEqual(deviceBlocks(undefined, now), []);
  assert.deepEqual(deviceBlocks([{ id: "b", name: "PC", at: now }], now)[0].tabs, []);
});
