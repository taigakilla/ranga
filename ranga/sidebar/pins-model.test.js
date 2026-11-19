import { test } from "node:test";
import assert from "node:assert/strict";
import { pinId, find, parentOf, links, addLink, addFolder, remove, rename, setUrl, toggle, move, place, drifted, prune, tabOf, forgetNode, pinSnapshot, restoreLive } from "./pins-model.js";

const tree = [
  { id: "f1", kind: "folder", title: "Trabalho", open: true, children: [
    { id: "l1", kind: "link", title: "GitLab", url: "https://gitlab.com/" },
    { id: "l2", kind: "link", title: "Grafana", url: "https://grafana.example/" },
  ] },
  { id: "l3", kind: "link", title: "Notion", url: "https://notion.so/" },
];

test("o id leva o prefixo e não repete no mesmo instante com sorteios diferentes", () => {
  assert.match(pinId("pin", 1000, 0.5), /^pin-/);
  assert.notEqual(pinId("pin", 1000, 0.1), pinId("pin", 1000, 0.9));
});

test("acha links dentro e fora das pastas, e a pasta de cada um", () => {
  assert.equal(find(tree, "l2").title, "Grafana");
  assert.equal(find(tree, "l3").title, "Notion");
  assert.equal(parentOf(tree, "l1").id, "f1");
  assert.equal(parentOf(tree, "l3"), null);
  assert.deepEqual(links(tree).map((l) => l.id), ["l1", "l2", "l3"]);
});

test("adicionar link na raiz ou numa pasta, que abre", () => {
  const closed = toggle(tree, "f1");
  const next = addLink(closed, { id: "n", url: "https://x.dev/", title: "" }, "f1", 0);
  assert.equal(find(next, "f1").open, true);
  assert.deepEqual(find(next, "f1").children.map((c) => c.id), ["n", "l1", "l2"]);
  assert.equal(find(next, "n").title, "https://x.dev/");
  assert.equal(addLink(tree, { id: "r", url: "https://r.dev/", title: "R" }).at(-1).id, "r");
});

test("remover pasta sobe os links dela pro lugar da pasta", () => {
  assert.deepEqual(remove(tree, "f1").map((n) => n.id), ["l1", "l2", "l3"]);
  assert.deepEqual(find(remove(tree, "l1"), "f1").children.map((c) => c.id), ["l2"]);
});

test("renomear ignora nome vazio; trocar endereço mantém o resto", () => {
  assert.equal(find(rename(tree, "f1", "  Job "), "f1").title, "Job");
  assert.equal(rename(tree, "f1", "  "), tree);
  const next = setUrl(tree, "l1", "https://gitlab.com/mr/42", "MR");
  assert.equal(find(next, "l1").url, "https://gitlab.com/mr/42");
  assert.equal(find(next, "l1").title, "MR");
  assert.equal(find(setUrl(tree, "l1", "https://a/"), "l1").title, "GitLab");
});

test("mover link entre pastas e raiz; pasta não entra em pasta", () => {
  const out = move(tree, "l1", null, 0);
  assert.deepEqual(out.map((n) => n.id), ["l1", "f1", "l3"]);
  const into = move(tree, "l3", "f1", 1);
  assert.deepEqual(find(into, "f1").children.map((c) => c.id), ["l1", "l3", "l2"]);
  const folder = addFolder(tree, { id: "f2", title: "Leitura" });
  assert.equal(move(folder, "f2", "f1"), folder);
  assert.equal(move(tree, "l3", "nada"), tree);
});

test("desvio de endereço ignora âncora e barra final", () => {
  assert.equal(drifted("https://gitlab.com/", "https://gitlab.com/#topo"), false);
  assert.equal(drifted("https://gitlab.com/a/", "https://gitlab.com/a"), false);
  assert.equal(drifted("https://gitlab.com/", "https://gitlab.com/mr/42"), true);
  assert.equal(drifted("https://gitlab.com/", ""), false);
});

test("cada janela e espaço tem a própria aba de um fixado", () => {
  const live = { 5: "l1", 8: "l1", 6: "l3" };
  assert.equal(tabOf(live, "l1", new Map([[8, {}]])), 8);
  assert.equal(tabOf(live, "l1", new Set([6])), null);
  assert.deepEqual(forgetNode(live, "l1"), { 6: "l3" });
});

test("mapa de abas vivas: limpar, achar e sobreviver ao reinício pela URL", () => {
  const live = { 5: "l1", 6: "l3", 7: "sumiu" };
  const kept = prune(live, new Set([5, 7]), new Set(["l1", "l3"]));
  assert.deepEqual(kept, { 5: "l1" });
  assert.equal(tabOf(live, "l3"), 6);
  assert.equal(tabOf(live, "x"), null);
  const shot = pinSnapshot(live, [{ id: 5, url: "https://gitlab.com/" }, { id: 9, url: "https://a/" }, { id: 6, url: "https://notion.so/" }]);
  assert.deepEqual(shot, [{ url: "https://gitlab.com/", pin: "l1" }, { url: "https://notion.so/", pin: "l3" }]);
  const restored = restoreLive([{ id: 50, url: "https://notion.so/" }, { id: 51, url: "https://gitlab.com/" }, { id: 52, url: "https://gitlab.com/" }], shot, new Set(["l1"]));
  assert.deepEqual(restored, { 51: "l1" });
  const besideIcon = restoreLive([{ id: 60, url: "https://gitlab.com/", pinned: true }, { id: 61, url: "https://gitlab.com/" }], shot, new Set(["l1"]));
  assert.deepEqual(besideIcon, { 61: "l1" });
});

test("soltar num cartão ocupa o lugar dele, pra frente ou pra trás", () => {
  const flat = [
    { id: "a", kind: "link", url: "a" }, { id: "b", kind: "link", url: "b" },
    { id: "c", kind: "link", url: "c" }, { id: "d", kind: "link", url: "d" },
  ];
  assert.deepEqual(place(flat, "a", "c").map((n) => n.id), ["b", "c", "a", "d"]);
  assert.deepEqual(place(flat, "d", "b").map((n) => n.id), ["a", "d", "b", "c"]);
  assert.deepEqual(place(flat, "b", "b").map((n) => n.id), ["a", "b", "c", "d"]);
  assert.deepEqual(find(place(tree, "l3", "l2"), "f1").children.map((c) => c.id), ["l1", "l3", "l2"]);
  const folder = addFolder(tree, { id: "f2", title: "Leitura" });
  assert.equal(place(folder, "f2", "l1"), folder);
});
