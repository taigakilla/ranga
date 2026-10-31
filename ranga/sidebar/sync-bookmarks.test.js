import { test } from "node:test";
import assert from "node:assert/strict";
import { roots, bookmarkItems, matchBookmarks, planBookmarks, orderMoves } from "./sync-bookmarks.js";

const tree = () => [{
  id: "0",
  children: [
    { id: "1", folderType: "bookmarks-bar", title: "Barra", children: [
      { id: "10", title: "GitHub", url: "https://github.com/" },
      { id: "11", title: "Trabalho", children: [{ id: "110", title: "Jira", url: "https://jira/" }] },
    ] },
    { id: "2", folderType: "other", title: "Outros", children: [] },
    { id: "3", folderType: "mobile", title: "Celular", children: [] },
  ],
}];

function counter() {
  let n = 0;
  return () => `s${++n}`;
}

test("raízes pelo tipo da pasta, ou pela posição sem tipo", () => {
  assert.deepEqual(Object.keys(roots(tree())), ["bar", "other", "mobile"]);
  const old = [{ id: "0", children: [{ id: "1", children: [] }, { id: "2", children: [] }] }];
  assert.deepEqual(Object.fromEntries(Object.entries(roots(old)).map(([k, v]) => [k, v.id])), { bar: "1", other: "2" });
});

test("itens com id próprio estável, pasta guarda a ordem dos filhos", () => {
  const { items, ids } = bookmarkItems(tree(), {}, counter());
  assert.equal(ids["1"], "bar");
  const github = ids["10"];
  const pasta = ids["11"];
  assert.deepEqual(items.bar, { root: true, order: [github, pasta] });
  assert.deepEqual(items[github], { parent: "bar", title: "GitHub", url: "https://github.com/" });
  assert.deepEqual(items[pasta], { parent: "bar", title: "Trabalho", order: [ids["110"]] });
  assert.deepEqual(bookmarkItems(tree(), ids, counter()).ids, ids);
});

test("primeiro encontro: casa os favoritos iguais pelo caminho, sem duplicar", () => {
  const remote = {
    bar: { root: true, order: ["r1", "r2", "r3"] },
    r1: { parent: "bar", title: "GitHub", url: "https://github.com/" },
    r2: { parent: "bar", title: "Trabalho", order: ["r4"] },
    r3: { parent: "bar", title: "Só lá", url: "https://la/" },
    r4: { parent: "r2", title: "Jira (renomeado)", url: "https://jira/" },
  };
  assert.deepEqual(matchBookmarks(tree(), remote), { 1: "bar", 10: "r1", 11: "r2", 110: "r4" });
});

test("primeiro encontro ignora o que foi apagado do outro lado", () => {
  const remote = { bar: { root: true, order: ["r1"] }, r1: { at: 1, deleted: true } };
  assert.deepEqual(matchBookmarks(tree(), remote), { 1: "bar" });
});

test("plano: apaga, cria pais antes dos filhos e atualiza o resto; nunca apaga raiz", () => {
  const ids = { 1: "bar", 10: "a", 11: "b" };
  const values = { x: { parent: "bar", title: "X", order: ["y"] }, y: { parent: "x", title: "Y", url: "https://y/" } };
  const { ops, folders } = planBookmarks(ids, values, {
    y: values.y,
    x: values.x,
    a: { parent: "bar", title: "GitHub 2", url: "https://github.com/" },
    bar: { root: true, order: ["x", "a"] },
  }, ["b", "bar", "zz"]);
  assert.deepEqual(ops.map((o) => `${o.op}:${o.sid}`), ["remove:b", "create:x", "update:a", "create:y"]);
  assert.deepEqual(folders.sort(), ["bar", "x"]);
});

test("movimentos pra chegar na ordem: o que não está na lista vai pro fim", () => {
  assert.deepEqual(orderMoves(["a", "b", "c"], ["a", "b", "c"]), []);
  assert.deepEqual(orderMoves(["a", "b", "c"], ["c", "a", "b"]), [["c", 0]]);
  assert.deepEqual(orderMoves(["a", "n", "b"], ["b", "a"]), [["b", 0]]);
  assert.deepEqual(orderMoves(["n", "a", "b"], ["b", "a"]), [["b", 0], ["a", 1]]);
});
