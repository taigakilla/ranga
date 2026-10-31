import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fakeDrive } from "../e2e/fake-drive.mjs";
import { driveStore } from "./sync-drive.js";

const drive = fakeDrive();
let api;

before(async () => {
  api = await drive.listen();
});

after(() => drive.close());

test("grava, lê, sobrescreve, lista e apaga", async () => {
  const store = driveStore({ api, token: async () => "fake-token" });
  assert.equal(await store.read("vault"), null);
  await store.write("vault", new Uint8Array([1, 2, 3]));
  assert.deepEqual(await store.read("vault"), new Uint8Array([1, 2, 3]));
  await store.write("vault", new Uint8Array([0, 255, 13, 10]));
  assert.deepEqual(await store.read("vault"), new Uint8Array([0, 255, 13, 10]));
  await store.write("device-ab", new Uint8Array([9]));
  assert.deepEqual((await store.list()).map((f) => f.name).sort(), ["device-ab", "vault"]);
  await store.remove("vault");
  assert.equal(await store.read("vault"), null);
  assert.deepEqual((await store.list()).map((f) => f.name), ["device-ab"]);
});

test("outro aparelho enxerga o que este gravou", async () => {
  const a = driveStore({ api, token: async () => "fake-token" });
  const b = driveStore({ api, token: async () => "fake-token" });
  await a.write("inbox-b-1", new Uint8Array([7]));
  assert.deepEqual(await b.read("inbox-b-1"), new Uint8Array([7]));
  await b.remove("inbox-b-1");
  await a.list();
  assert.equal(await a.read("inbox-b-1"), null);
});

test("token vencido: pede um novo e repete uma vez", async () => {
  const asked = [];
  const store = driveStore({ api, token: async (fresh) => (asked.push(fresh), fresh ? "fake-token" : "velho") });
  await store.list();
  assert.deepEqual(asked, [false, true]);
});

test("sem acesso de verdade, falha com o status", async () => {
  const store = driveStore({ api, token: async () => "errado" });
  await assert.rejects(store.list(), { status: 401 });
});
