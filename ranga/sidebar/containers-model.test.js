import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadContainers, createContainer, updateContainer, deleteContainer, membership, slug, DEFAULT_CONTAINERS,
  addPage, removePage, updatePage, findPage, toggleGroup, pageIds, pagesOf, restorePages, pageTitle,
} from "./containers-model.js";

test("sem nada salvo vêm Trabalho e Pessoal; lista salva vazia continua vazia", () => {
  assert.deepEqual(loadContainers(undefined).map((c) => c.id), ["trabalho", "pessoal"]);
  assert.deepEqual(loadContainers([]), []);
  assert.deepEqual(loadContainers([{ id: "X y", name: "x", color: "#fff", icon: "user" }, DEFAULT_CONTAINERS[0]]).map((c) => c.id), ["trabalho"]);
});

test("id vem do nome, sem acento, e não repete", () => {
  assert.equal(slug("Banco & Finanças"), "banco-financas");
  let list = createContainer([], { name: " Banco " });
  list = createContainer(list, { name: "banco" });
  assert.deepEqual(list.map((c) => [c.id, c.name]), [["banco", "Banco"], ["banco-2", "banco"]]);
  assert.throws(() => createContainer(list, { name: "  " }));
});

test("editar mantém o id e ignora nome vazio; apagar remove", () => {
  const list = loadContainers(undefined);
  const edited = updateContainer(list, "trabalho", { name: "", color: "#000000", id: "outro" });
  assert.deepEqual(edited[0], { id: "trabalho", name: "Trabalho", color: "#000000", icon: "briefcase" });
  assert.deepEqual(deleteContainer(list, "trabalho").map((c) => c.id), ["pessoal"]);
});

test("o container guarda páginas como as fixadas", () => {
  let list = [{ id: "trabalho", name: "Trabalho", color: "#fff", icon: "briefcase" }, { id: "pessoal", name: "Pessoal", color: "#000", icon: "user" }];
  list = addPage(list, "trabalho", { id: "p1", url: "https://mail.com/", title: "Mail" });
  list = addPage(list, "trabalho", { id: "p2", url: "https://jira.com/", title: "" }, 0);
  assert.deepEqual(pagesOf(list[0]).map((p) => p.id), ["p2", "p1"]);
  assert.equal(pagesOf(list[0])[0].title, "https://jira.com/");
  assert.equal(findPage(list, "p1").container.id, "trabalho");
  list = updatePage(list, "p1", { url: "https://mail.com/inbox", id: "x" });
  assert.deepEqual(findPage(list, "p1").page, { id: "p1", url: "https://mail.com/inbox", title: "Mail" });
  assert.deepEqual([...pageIds(list)].sort(), ["p1", "p2"]);
  list = removePage(list, "p2");
  assert.equal(findPage(list, "p2"), null);
  list = toggleGroup(list, "trabalho");
  assert.equal(list[0].collapsed, true);
  assert.equal(list[1].collapsed, undefined);
  assert.deepEqual(pagesOf(list[1]), []);
});

test("ao reabrir, a página do grupo volta pra uma aba com a mesma URL", () => {
  const list = [{ id: "trabalho", name: "Trabalho", color: "#fff", icon: "briefcase", pages: [{ id: "p1", url: "https://w.org/", title: "W" }] }];
  const tabs = [{ id: 1, url: "https://x.org/" }, { id: 2, url: "https://w.org/" }];
  assert.deepEqual(restorePages(tabs, [{ pin: "p1", url: "https://w.org/" }, { pin: "gone", url: "x" }], list), { 2: "p1" });
  assert.deepEqual(restorePages(tabs, undefined, list), {});
});

test("a página do grupo mostra o nome dado, o salvo ou o do favorito antes da URL", () => {
  const page = { id: "p1", url: "https://w.org/", title: "https://w.org/" };
  assert.equal(pageTitle(page), "https://w.org/");
  assert.equal(pageTitle(page, { live: "W" }), "W");
  assert.equal(pageTitle(page, { bookmark: "Wiki", live: "W" }), "Wiki");
  assert.equal(pageTitle({ ...page, title: "Minha wiki" }, { bookmark: "Wiki", live: "W" }), "Minha wiki");
  assert.equal(pageTitle({ ...page, title: "Minha wiki" }, { custom: "Renomeada" }), "Renomeada");
});
