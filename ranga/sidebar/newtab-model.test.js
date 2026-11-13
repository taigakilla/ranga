import test from "node:test";
import assert from "node:assert/strict";
import { greeting, parseNews, ago, weatherIcon, hourly, shortcuts, placesUrl, places } from "./newtab-model.js";

test("a saudação segue a hora do dia", () => {
  assert.equal(greeting(6), "Bom dia");
  assert.equal(greeting(12), "Boa tarde");
  assert.equal(greeting(19), "Boa noite");
  assert.equal(greeting(3), "Boa noite");
});

test("as notícias do Google Notícias saem sem o nome da fonte no título", () => {
  const xml = `<rss><channel><item><title>Lobo é visto em Minas - G1</title><link>https://news.google.com/a</link><pubDate>Mon, 26 Oct 2026 12:00:00 GMT</pubDate><source url="https://g1.globo.com">G1</source></item><item><title>Sem link</title></item><item><title><![CDATA[Chuva &amp; frio]]></title><link>https://news.google.com/b</link><source url="https://x.com">X &amp; Y</source></item></channel></rss>`;
  const news = parseNews(xml);
  assert.equal(news.length, 2);
  assert.deepEqual(news[0], { title: "Lobo é visto em Minas", link: "https://news.google.com/a", source: "G1", sourceUrl: "https://g1.globo.com", published: Date.parse("Mon, 26 Oct 2026 12:00:00 GMT") });
  assert.equal(news[1].title, "Chuva & frio");
  assert.equal(news[1].source, "X & Y");
});

test("o tempo desde a publicação fica curto", () => {
  const now = Date.parse("2026-10-26T15:00:00Z");
  assert.equal(ago(now - 5 * 60000, now), "há 5 min");
  assert.equal(ago(now - 3 * 3600000, now), "há 3 h");
  assert.equal(ago(now - 26 * 3600000, now), "há 1 dia");
  assert.equal(ago(null, now), "");
});

test("o código do tempo vira ícone, de dia e de noite", () => {
  assert.equal(weatherIcon(0), "sun");
  assert.equal(weatherIcon(0, false), "moon");
  assert.equal(weatherIcon(63), "cloud-rain");
  assert.equal(weatherIcon(95), "cloud-lightning");
});

test("a previsão por hora começa na hora atual", () => {
  const forecast = { hourly: { time: ["2026-10-26T13:00", "2026-10-26T14:00", "2026-10-26T15:00"], temperature_2m: [24.4, 25.6, 26.1], weather_code: [0, 2, 3], is_day: [1, 1, 1] } };
  const hours = hourly(forecast, Date.parse("2026-10-26T14:30"), 2);
  assert.deepEqual(hours.map((h) => [h.hour, h.temp, h.code]), [[14, 26, 2], [15, 26, 3]]);
});

test("os atalhos juntam fixadas e mais visitados sem repetir", () => {
  const pinned = [{ url: "https://youtube.com/", title: "YouTube" }];
  const top = [{ url: "https://youtube.com", title: "YT" }, { url: "chrome://history", title: "x" }, { url: "https://github.com/", title: "" }];
  assert.deepEqual(shortcuts(pinned, top), [
    { url: "https://youtube.com/", title: "YouTube", pinned: true },
    { url: "https://github.com/", title: "github.com", pinned: false },
  ]);
});

test("a busca de cidade vira lugares com nome, estado e país", () => {
  assert.equal(placesUrl(" Patos de Minas "), "https://geocoding-api.open-meteo.com/v1/search?name=Patos%20de%20Minas&count=5&language=pt&format=json");
  const json = { results: [
    { name: "Patos de Minas", admin1: "Minas Gerais", country: "Brasil", latitude: -18.58, longitude: -46.51 },
    { name: "Mônaco", country: "Mônaco", latitude: 43.73, longitude: 7.42 },
    { name: "Sem lugar" },
  ] };
  assert.deepEqual(places(json), [
    { name: "Patos de Minas", label: "Patos de Minas, Minas Gerais, Brasil", latitude: -18.58, longitude: -46.51 },
    { name: "Mônaco", label: "Mônaco", latitude: 43.73, longitude: 7.42 },
  ]);
  assert.deepEqual(places({}), []);
});
