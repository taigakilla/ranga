import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, loadSettings, displayUrl, mainLanguage, withMainLanguage } from "./settings-model.js";

test("sem nada salvo, valem os padrões", () => {
  assert.deepEqual(loadSettings(undefined), DEFAULTS);
});

test("valores salvos válidos sobrescrevem os padrões", () => {
  const s = loadSettings({ followCielTheme: false, density: "compact" });
  assert.equal(s.followCielTheme, false);
  assert.equal(s.density, "compact");
  assert.equal(s.showFullUrl, DEFAULTS.showFullUrl);
});

test("tipos errados e chaves desconhecidas são ignorados", () => {
  const s = loadSettings({ followCielTheme: "sim", density: "gigante", lixo: 1 });
  assert.deepEqual(s, DEFAULTS);
});

test("URL resumida mostra só o domínio sem www", () => {
  assert.equal(displayUrl("https://www.github.com/taigakilla/ranga?tab=1", false), "github.com");
});

test("URL completa quando configurado", () => {
  assert.equal(displayUrl("https://github.com/taigakilla/ranga", true), "https://github.com/taigakilla/ranga");
});

test("páginas internas aparecem com o esquema", () => {
  assert.equal(displayUrl("chrome://settings/appearance", false), "ranga://settings");
});

test("URL inválida ou vazia não quebra", () => {
  assert.equal(displayUrl("", false), "");
  assert.equal(displayUrl("nao é url", false), "nao é url");
});

test("opacidade do material: padrão 85, aceita 0 a 100 inteiro", () => {
  assert.equal(loadSettings(undefined).materialOpacity, 85);
  assert.equal(loadSettings({ materialOpacity: 40 }).materialOpacity, 40);
  assert.equal(loadSettings({ materialOpacity: 140 }).materialOpacity, 85);
  assert.equal(loadSettings({ materialOpacity: -1 }).materialOpacity, 85);
  assert.equal(loadSettings({ materialOpacity: 50.5 }).materialOpacity, 85);
});

test("dormir e arquivar: padrões e só as escolhas válidas", () => {
  const d = loadSettings(undefined);
  assert.equal(d.sleepAfterMinutes, 30);
  assert.equal(d.archiveAfterHours, 12);
  assert.equal(loadSettings({ sleepAfterMinutes: 0 }).sleepAfterMinutes, 0);
  assert.equal(loadSettings({ sleepAfterMinutes: 45 }).sleepAfterMinutes, 30);
  assert.equal(loadSettings({ archiveAfterHours: 168 }).archiveAfterHours, 168);
  assert.equal(loadSettings({ archiveAfterHours: "12" }).archiveAfterHours, 12);
});

test("nova aba não mostra endereço", () => {
  assert.equal(displayUrl("chrome://newtab/", false), "");
  assert.equal(displayUrl("chrome://newtab/", true), "");
});

test("páginas internas aparecem como ranga://", () => {
  assert.equal(displayUrl("chrome://extensions/?id=x", true), "ranga://extensions/?id=x");
  assert.equal(displayUrl("chrome-extension://hncljkmljckjojdjincglklbdihcaeko/settings.html", false), "ranga://configurações");
  assert.equal(displayUrl("chrome-extension://hncljkmljckjojdjincglklbdihcaeko/newtab.html", false), "");
  assert.equal(displayUrl("chrome-extension://outra/popup.html", false), "chrome-extension://outra");
});

test("Peek nas fixadas: ligado por padrão, só aceita booleano", () => {
  assert.equal(loadSettings(undefined).peekPinnedLinks, true);
  assert.equal(loadSettings({ peekPinnedLinks: false }).peekPinnedLinks, false);
  assert.equal(loadSettings({ peekPinnedLinks: "não" }).peekPinnedLinks, true);
});

test("janela pequena pra links de outros apps: ligada por padrão, só aceita booleano", () => {
  assert.equal(loadSettings(undefined).littleWindowLinks, true);
  assert.equal(loadSettings({ littleWindowLinks: false }).littleWindowLinks, false);
  assert.equal(loadSettings({ littleWindowLinks: 1 }).littleWindowLinks, true);
});

test("idioma principal vai pro topo dos idiomas preferidos, com a variante sem país logo depois", () => {
  assert.equal(withMainLanguage("en-US,en,pt-BR", "pt-BR"), "pt-BR,pt,en-US,en");
  assert.equal(withMainLanguage("pt-BR,pt,en-US,en", "en-US"), "en-US,en,pt-BR,pt");
  assert.equal(withMainLanguage("", "pt-BR"), "pt-BR,pt");
  assert.equal(mainLanguage("en-US,en,pt-BR"), "en-US");
  assert.equal(mainLanguage("pt,en"), "pt-BR");
  assert.equal(mainLanguage("es-ES,es"), "es-ES");
});
