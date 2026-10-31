import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STALE_MS, stable, deviceTabs, otherDevices, track, detach, merge, resolve,
  containerItems, applyContainers, spaceItems, applySpaces, unionPins, remoteMatches, deviceHistory, mergeHistory, remoteHistoryMatches, deviceExtensions, missingExtensions, inboxName, inboxTarget, deviceOf,
} from "./sync-model.js";

test("stable ignora a ordem das chaves", () => {
  assert.equal(stable({ b: 1, a: [{ d: 2, c: 3 }] }), stable({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test("abas do aparelho: só http(s), sem anônimas, com o nome do espaço", () => {
  const tabs = [
    { id: 1, url: "https://a.com/", title: "A" },
    { id: 2, url: "chrome://settings/", title: "Config" },
    { id: 3, url: "https://b.com/", title: "B", incognito: true },
    { id: 4, url: "", pendingUrl: "http://c.com/", title: "" },
  ];
  assert.deepEqual(deviceTabs(tabs, (t) => (t.id === 1 ? "Trabalho" : "")), [
    { url: "https://a.com/", title: "A", space: "Trabalho" },
    { url: "http://c.com/", title: "", space: "" },
  ]);
});

test("outros aparelhos: tira este e os parados há mais de 30 dias, mais recente primeiro", () => {
  const now = STALE_MS * 2;
  const docs = [{ id: "a", at: now - 10 }, { id: "self", at: now }, { id: "b", at: now - 5 }, { id: "c", at: now - STALE_MS - 1 }];
  assert.deepEqual(otherDevices(docs, "self", now).map((d) => d.id), ["b", "a"]);
});

test("track marca hora só no que mudou e lápide no que sumiu", () => {
  const first = track({}, { x: { name: "X" }, y: { name: "Y" } }, 10);
  assert.equal(first.x.at, 10);
  const second = track(first, { x: { name: "X" }, z: { name: "Z" } }, 20);
  assert.equal(second.x.at, 10);
  assert.equal(second.z.at, 20);
  assert.deepEqual(second.y, { at: 20, deleted: true });
});

test("lápide antiga é esquecida depois de 30 dias", () => {
  const ledger = { y: { at: 0, deleted: true } };
  assert.deepEqual(track(ledger, {}, STALE_MS + 1), {});
  assert.deepEqual(track(ledger, {}, 5), ledger);
});

test("merge escolhe a versão mais nova; empate pelo id do aparelho", () => {
  const merged = merge([
    { device: "a", ledger: { x: { at: 5, hash: "1", value: 1 }, y: { at: 3, hash: "1", value: 1 } } },
    { device: "b", ledger: { x: { at: 4, hash: "2", value: 2 }, y: { at: 3, hash: "2", value: 2 } } },
  ]);
  assert.equal(merged.x.value, 1);
  assert.equal(merged.y.value, 2);
});

test("resolve aplica o que veio de fora e ignora o que é mais velho que o local", () => {
  const local = { x: { at: 10, hash: "a", value: "a" }, y: { at: 1, hash: "a", value: "a" } };
  const merged = { x: { at: 5, hash: "b", value: "b" }, y: { at: 7, deleted: true }, z: { at: 8, hash: "z", value: "z" } };
  const out = resolve(local, merged);
  assert.deepEqual(out.set, { z: "z" });
  assert.deepEqual(out.remove, ["y"]);
  assert.equal(out.ledger.x.at, 10);
  assert.equal(out.ledger.z.at, 8);
});

test("depois de aplicar, o track não reenvia a mudança recebida", () => {
  const remote = track({}, containerItems([{ id: "t", name: "Trabalho", color: "#fff", icon: "briefcase" }]), 50);
  const { set, remove, ledger } = resolve({}, merge([{ device: "b", ledger: remote }]));
  const list = applyContainers([], { set, remove });
  const again = track(ledger, containerItems(list), 99);
  assert.equal(again.t.at, 50);
});

test("grupos: aplica, remove e preserva o recolhido deste aparelho", () => {
  const list = [
    { id: "a", name: "A", color: "#1", icon: "i", collapsed: true },
    { id: "b", name: "B", color: "#2", icon: "i" },
  ];
  const out = applyContainers(list, {
    set: { a: { id: "a", name: "A2", color: "#1", icon: "i", order: 1 }, c: { id: "c", name: "C", color: "#3", icon: "i", order: 0 } },
    remove: ["b"],
  });
  assert.deepEqual(out.map((c) => [c.id, c.name, Boolean(c.collapsed)]), [["c", "C", false], ["a", "A2", true]]);
});

test("grupos publicados sem o estado recolhido", () => {
  assert.deepEqual(containerItems([{ id: "a", name: "A", color: "#1", icon: "i", collapsed: true }]), { a: { id: "a", name: "A", color: "#1", icon: "i", order: 0 } });
});

const base = {
  spaces: [
    { id: "pessoal", name: "Pessoal", icon: "house", color: null, session: "" },
    { id: "trabalho", name: "Trabalho", icon: "briefcase", color: "#1", session: "trabalho", sync: true },
  ],
  tabSpace: { 7: "trabalho" },
  tabTitle: {},
  active: { 1: "trabalho" },
  lastTab: {},
};

test("só espaços marcados pra sincronizar saem, com as fixadas sem estado de pasta aberta", () => {
  const pins = { trabalho: [{ id: "f", kind: "folder", title: "F", open: true, children: [{ id: "l", kind: "link", url: "https://x/", title: "X" }] }] };
  assert.deepEqual(spaceItems(base, pins), {
    trabalho: { name: "Trabalho", icon: "briefcase", color: "#1", order: 1, pins: [{ id: "f", kind: "folder", title: "F", children: [{ id: "l", kind: "link", url: "https://x/", title: "X" }] }] },
  });
});

test("espaço novo de outro aparelho chega com sessão própria e fixadas", () => {
  const { state, pins } = applySpaces(base, {}, { set: { estudos: { name: "Estudos", icon: "book", color: null, order: 2, pins: [] } }, remove: [], detached: [] });
  assert.deepEqual(state.spaces.at(-1), { id: "estudos", name: "Estudos", icon: "book", color: null, session: "estudos", sync: true });
  assert.deepEqual(pins.estudos, []);
});

test("espaço apagado em outro aparelho some e as abas voltam pro primeiro espaço", () => {
  const { state } = applySpaces(base, { trabalho: [] }, { set: {}, remove: ["trabalho"], detached: [] });
  assert.deepEqual(state.spaces.map((s) => s.id), ["pessoal"]);
  assert.equal(state.tabSpace[7], "pessoal");
  assert.equal(state.active[1], "pessoal");
});

test("parar de sincronizar em outro aparelho mantém a cópia local, sem sync", () => {
  const { state } = applySpaces(base, {}, { set: {}, remove: [], detached: ["trabalho"] });
  assert.equal(state.spaces[1].sync, false);
});

test("o último espaço nunca é apagado", () => {
  const only = { ...base, spaces: [base.spaces[1]] };
  assert.equal(applySpaces(only, {}, { set: {}, remove: ["trabalho"], detached: [] }).state.spaces.length, 1);
});

test("detach vira marca de desligado no livro", () => {
  const ledger = { trabalho: { at: 1, hash: "h", value: {} } };
  assert.deepEqual(detach(ledger, ["trabalho"], 9).trabalho, { at: 9, detached: true });
  const merged = merge([{ device: "a", ledger: detach(ledger, ["trabalho"], 9) }]);
  assert.deepEqual(resolve(ledger, merged).detached, ["trabalho"]);
});

test("nomes dos arquivos", () => {
  assert.equal(inboxTarget(inboxName("ab12", "cd34")), "ab12");
  assert.equal(inboxTarget("device-ab12"), null);
  assert.equal(deviceOf("device-ab12"), "ab12");
  assert.equal(deviceOf("vault"), null);
});

test("espaço com o mesmo nome que só existia aqui junta as fixadas dos dois", () => {
  const local = { ...base, spaces: [base.spaces[0], { ...base.spaces[1], sync: false }] };
  const mine = [{ id: "m", kind: "link", url: "https://mine/", title: "M" }, { id: "d", kind: "link", url: "https://dup/", title: "D" }];
  const theirs = [{ id: "t", kind: "link", url: "https://dup/", title: "D" }];
  const { state, pins } = applySpaces(local, { trabalho: mine }, { set: { trabalho: { name: "Trabalho", icon: "briefcase", color: "#1", order: 1, pins: theirs } }, remove: [], detached: [] });
  assert.equal(state.spaces[1].sync, true);
  assert.deepEqual(pins.trabalho.map((p) => p.id), ["t", "m"]);
});

test("apagar um espaço sincronizado não apaga o espaço só local de mesmo id", () => {
  const local = { ...base, spaces: [base.spaces[0], { ...base.spaces[1], sync: false }] };
  assert.equal(applySpaces(local, {}, { set: {}, remove: ["trabalho"], detached: [] }).state.spaces.length, 2);
});

test("união de fixadas tira links repetidos de dentro das pastas", () => {
  const remote = [{ id: "a", kind: "link", url: "https://a/" }];
  const local = [{ id: "f", kind: "folder", title: "F", children: [{ id: "a2", kind: "link", url: "https://a/" }] }];
  assert.deepEqual(unionPins(remote, local), remote);
});

test("desligar o sync de um espaço vira marca de desligado, não lápide", () => {
  const ledger = track({}, spaceItems(base, {}), 1);
  const off = { ...base, spaces: base.spaces.map((s) => ({ ...s, sync: false })) };
  const next = track(detach(ledger, off.spaces.map((s) => s.id), 2), spaceItems(off, {}), 2);
  assert.deepEqual(next.trabalho, { at: 2, detached: true });
});

test("busca nas abas dos outros aparelhos, sem acento e com todas as palavras", () => {
  const devices = [{ name: "Notebook", tabs: [{ url: "https://pt.wikipedia.org/wiki/Ação", title: "Ação – Wikipédia" }, { url: "https://mdn.io/", title: "MDN" }] }];
  assert.deepEqual(remoteMatches(devices, "acao wiki"), [
    { kind: "header", title: "Outros aparelhos" },
    { kind: "remote", title: "Ação – Wikipédia", url: "https://pt.wikipedia.org/wiki/Ação", device: "Notebook" },
  ]);
  assert.deepEqual(remoteMatches(devices, ""), []);
  assert.deepEqual(remoteMatches(devices, "nada"), []);
  assert.deepEqual(remoteMatches(undefined, "mdn"), []);
});

test("histórico do aparelho: só http(s), mais recente primeiro", () => {
  assert.deepEqual(deviceHistory([
    { url: "https://a/", title: "A", lastVisitTime: 1 },
    { url: "chrome://history/", title: "H", lastVisitTime: 9 },
    { url: "https://b/", title: "", lastVisitTime: 5 },
  ]), [{ url: "https://b/", title: "", at: 5 }, { url: "https://a/", title: "A", at: 1 }]);
});

test("histórico de vários aparelhos: um por URL, a visita mais nova vence", () => {
  const merged = mergeHistory([
    { device: "PC", items: [{ url: "https://a/", title: "A", at: 1 }] },
    { device: "Note", items: [{ url: "https://a/", title: "A2", at: 3 }, { url: "https://b/", title: "B", at: 2 }] },
  ]);
  assert.deepEqual(merged.map((h) => [h.url, h.device]), [["https://a/", "Note"], ["https://b/", "Note"]]);
});

test("busca no histórico dos outros pula o que já apareceu", () => {
  const history = [{ url: "https://mdn.io/", title: "MDN", at: 2, device: "Note" }, { url: "https://mdn.dev/", title: "MDN Dev", at: 1, device: "PC" }];
  assert.deepEqual(remoteHistoryMatches(history, "mdn", ["https://mdn.io/"]), [
    { kind: "header", title: "Histórico de outros aparelhos" },
    { kind: "remote", title: "MDN Dev", url: "https://mdn.dev/", device: "PC" },
  ]);
  assert.deepEqual(remoteHistoryMatches(history, " "), []);
});

test("extensões publicadas: só as da loja, sem temas nem a própria barra", () => {
  const list = [
    { id: "u", name: "uBlock", type: "extension", installType: "normal" },
    { id: "d", name: "Dev", type: "extension", installType: "development" },
    { id: "t", name: "Tema", type: "theme", installType: "normal" },
    { id: "self", name: "Ranga", type: "extension", installType: "normal" },
  ];
  assert.deepEqual(deviceExtensions(list, "self"), [{ id: "u", name: "uBlock" }]);
});

test("extensões que faltam aqui, com os aparelhos que têm", () => {
  const devices = [{ name: "Note", extensions: [{ id: "a", name: "1Password" }, { id: "b", name: "Bitwarden" }] }, { name: "PC2", extensions: [{ id: "a", name: "1Password" }] }];
  assert.deepEqual(missingExtensions(devices, ["b"]), [{ id: "a", name: "1Password", devices: ["Note", "PC2"] }]);
});
