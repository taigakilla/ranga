import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUrl, markdownLink, droppedText } from "./link-model.js";

test("link limpo tira parâmetros de rastreamento e mantém o resto", () => {
  assert.equal(cleanUrl("https://a.dev/p?id=3&utm_source=x&utm_medium=y&fbclid=z#topo"), "https://a.dev/p?id=3#topo");
  assert.equal(cleanUrl("https://a.dev/p?utm_source=x"), "https://a.dev/p");
  assert.equal(cleanUrl("https://www.youtube.com/watch?v=abc&si=123"), "https://www.youtube.com/watch?v=abc");
  assert.equal(cleanUrl("chrome://settings"), "chrome://settings");
  assert.equal(cleanUrl("não é url"), "não é url");
});

test("markdown escapa colchetes do título e parênteses da URL", () => {
  assert.equal(markdownLink("Arc [web]", "https://a.dev/x_(y)?utm_source=z"), "[Arc \\[web\\]](https://a.dev/x_(y%29)");
  assert.equal(markdownLink("", "https://a.dev/"), "[https://a.dev/](https://a.dev/)");
});

test("o que foi arrastado vira link ou busca", () => {
  assert.deepEqual(droppedText("# comentário\nhttps://a.dev/x\n", "Arc"), { url: "https://a.dev/x" });
  assert.deepEqual(droppedText("", "  https://a.dev/y  "), { url: "https://a.dev/y" });
  assert.deepEqual(droppedText("", "  como fazer\n pão  "), { text: "como fazer pão" });
  assert.equal(droppedText("", "   "), null);
});
