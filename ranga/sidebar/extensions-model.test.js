import { test } from "node:test";
import assert from "node:assert/strict";
import { others, pinnedIds, pinnedActions, togglePin, extensionRows, MAX_DEFAULT_PINS } from "./extensions-model.js";

const actions = [
  { id: "ublock", name: "uBlock Origin" },
  { id: "ranga", name: "Ranga — barra lateral" },
  { id: "onepassword", name: "1Password" },
  { id: "dark", name: "Dark Reader" },
];

test("a própria barra lateral não aparece e a lista vem em ordem alfabética", () => {
  assert.deepEqual(others(actions, "ranga").map((a) => a.id), ["onepassword", "dark", "ublock"]);
});

test("sem escolha salva, as primeiras extensões ficam fixadas", () => {
  const list = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, name: `E${i}` }));
  assert.equal(pinnedIds(undefined, list).length, MAX_DEFAULT_PINS);
  assert.deepEqual(pinnedIds([], list), []);
  assert.deepEqual(pinnedIds(["e5"], list), ["e5"]);
});

test("fixadas seguem a ordem salva e ignoram extensões removidas", () => {
  assert.deepEqual(pinnedActions(actions, ["dark", "sumiu", "ublock"]).map((a) => a.id), ["dark", "ublock"]);
});

test("fixar e desafixar", () => {
  assert.deepEqual(togglePin(["a"], "b"), ["a", "b"]);
  assert.deepEqual(togglePin(["a", "b"], "a"), ["b"]);
});

test("linhas juntam as fixáveis com as que dá pra ligar e desligar", () => {
  const installed = [
    { id: "onepassword", name: "1Password", type: "extension", enabled: true, mayDisable: true },
    { id: "dark", name: "Dark Reader", type: "extension", enabled: false, mayDisable: true, icons: [{ url: "p16" }, { url: "p128" }] },
    { id: "app", name: "App", type: "hosted_app", enabled: true, mayDisable: true },
    { id: "ranga", name: "Ranga — barra lateral", type: "extension", enabled: true, mayDisable: true },
  ];
  const enabledActions = actions.filter((a) => a.id !== "dark");
  assert.deepEqual(extensionRows(enabledActions, installed, "ranga"), [
    { id: "onepassword", name: "1Password", icon: undefined, pinnable: true, enabled: true },
    { id: "dark", name: "Dark Reader", icon: "p128", pinnable: false, enabled: false },
    { id: "ublock", name: "uBlock Origin", icon: undefined, pinnable: true },
  ]);
});
