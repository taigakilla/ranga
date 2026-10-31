import { test } from "node:test";
import assert from "node:assert/strict";
import { newVaultKey, recoveryKey, parseRecoveryKey, seal, open, toBase64, fromBase64 } from "./sync-crypto.js";

test("a chave de recuperação volta à chave original", () => {
  for (let i = 0; i < 50; i++) {
    const key = newVaultKey();
    assert.deepEqual(parseRecoveryKey(recoveryKey(key)), key);
  }
});

test("chave de recuperação em grupos de 4, sem letras ambíguas", () => {
  const text = recoveryKey(newVaultKey());
  assert.match(text, /^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
});

test("a chave digitada aceita minúsculas, espaços e O/I/L trocados", () => {
  const key = new Uint8Array(32).fill(0);
  const text = recoveryKey(key).toLowerCase().replace(/-/g, " ").replace(/0/g, "o");
  assert.deepEqual(parseRecoveryKey(text), key);
});

test("chave de recuperação inválida devolve null", () => {
  assert.equal(parseRecoveryKey(""), null);
  assert.equal(parseRecoveryKey("ABCD-EFGH"), null);
  assert.equal(parseRecoveryKey(recoveryKey(newVaultKey()).replace(/^./, "U")), null);
});

test("cifra e decifra um objeto", async () => {
  const key = newVaultKey();
  const value = { tabs: [{ url: "https://example.com/", title: "Exemplo ç" }] };
  assert.deepEqual(await open(key, "device-a", await seal(key, "device-a", value)), value);
});

test("objeto trocado de nome ou chave errada não abre", async () => {
  const key = newVaultKey();
  const sealed = await seal(key, "device-a", { a: 1 });
  await assert.rejects(open(key, "device-b", sealed));
  await assert.rejects(open(newVaultKey(), "device-a", sealed));
});

test("base64 de ida e volta", () => {
  const key = newVaultKey();
  assert.deepEqual(fromBase64(toBase64(key)), key);
});
