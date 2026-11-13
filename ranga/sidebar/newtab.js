import { glyph } from "./kurobe/icons.mjs";
import "./kurobe/loading-indicator.mjs";
import { current, label } from "./shortcuts-model.js";
import { available as rangaPrivate, call } from "./ranga-private.js";
import { loadSettings } from "./settings-model.js";
import { links } from "./pins-model.js";
import { greeting, fullDate, parseNews, ago, weatherIcon, weatherLabel, hourly, shortcuts, placesUrl, places } from "./newtab-model.js";

const NEWS_URL = "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419";
const FRESH = 30 * 60 * 1000;
const RANGA = "chrome-extension://hncljkmljckjojdjincglklbdihcaeko/";
const $ = (id) => document.getElementById(id);
const themeStyle = $("ranga-theme");

function paintIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    const target = el.classList.contains("k-icon") ? el : el.querySelector(".k-icon") || el.appendChild(Object.assign(document.createElement("span"), { className: "k-icon" }));
    target.textContent = glyph(el.dataset.icon);
  }
}

function favicon(url, size) {
  return `${RANGA}_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const tab = await chrome.tabs.getCurrent();
const stored = await chrome.storage.local.get(["settings", "shortcuts", "spaces", "pins", "tasks", "newsCache", "weatherCache", "weatherPlace"]);
const settings = loadSettings(stored.settings);

function paintClock() {
  const now = new Date();
  $("greeting").textContent = greeting(now.getHours());
  $("date").textContent = fullDate(now);
}
paintClock();
setInterval(paintClock, 30 * 1000);

async function search() {
  if (rangaPrivate && tab) await call("executeCommand", tab.windowId, "openLocation").catch(() => {});
}
const keys = current(stored.shortcuts).find((s) => s.command === "openLocation")?.keys;
$("keys").replaceChildren(...label(keys).map((k) => el("kbd", "", k)));
$("search").onclick = search;

async function paintShortcuts() {
  const space = tab ? stored.spaces?.active?.[tab.windowId] : null;
  const pinned = space ? links(stored.pins?.[space] ?? []).map((n) => ({ url: n.url, title: n.title })) : [];
  const top = await chrome.topSites?.get().catch(() => []) ?? [];
  $("shortcuts").replaceChildren(...shortcuts(pinned, top).map((site) => {
    const a = el("a", `tile${site.pinned ? " tile--pinned" : ""}`);
    a.href = site.url;
    a.title = site.title;
    const icon = el("span", "tile__icon");
    icon.append(Object.assign(document.createElement("img"), { src: favicon(site.url, 64), alt: "" }));
    a.append(icon, el("span", "tile__label k-type-caption", site.title));
    return a;
  }));
}
paintShortcuts();

async function cached(key, url, parse) {
  const hit = stored[key];
  if (hit?.url === url && Date.now() - hit.at < FRESH) return hit.data;
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  const data = parse(await response.text());
  stored[key] = { url, at: Date.now(), data };
  await chrome.storage.local.set({ [key]: stored[key] });
  return data;
}

let placed = false;

async function paintWeather(place) {
  $("weather-form").hidden = Boolean(place);
  $("weather-empty").hidden = Boolean(place);
  if (!place) return;
  placed = true;
  $("weather-places").replaceChildren();
  $("weather-title").textContent = place.name ? `Tempo em ${place.name}` : "Tempo";
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,is_day&hourly=temperature_2m,weather_code,is_day&forecast_days=2&timezone=auto`;
  const forecast = await cached("weatherCache", url, JSON.parse).catch(() => null);
  if (!forecast) {
    $("weather-empty").textContent = "Não deu pra buscar a previsão agora.";
    $("weather-empty").hidden = false;
    return;
  }
  const now = forecast.current;
  if (now) {
    $("now-icon").textContent = glyph(weatherIcon(now.weather_code, Boolean(now.is_day)));
    $("now-temp").textContent = `${Math.round(now.temperature_2m)}°`;
    $("now-label").textContent = [weatherLabel(now.weather_code), place.name].filter(Boolean).join(" · ");
    $("now").hidden = false;
  }
  $("hours").replaceChildren(...hourly(forecast, Date.now()).map((h, i) => {
    const li = el("li", "hour");
    li.append(el("span", "hour__time k-type-caption", i === 0 ? "Agora" : `${h.hour}h`), Object.assign(el("span", "k-icon"), { textContent: glyph(weatherIcon(h.code, h.day)) }), el("span", "hour__temp k-type-label", `${h.temp}°`));
    return li;
  }));
}

$("weather-form").onsubmit = async (e) => {
  e.preventDefault();
  const query = $("weather-input").value.trim();
  if (!query) return;
  const found = await fetch(placesUrl(query)).then((r) => r.json()).then(places).catch(() => []);
  $("weather-empty").textContent = found.length ? "Qual delas?" : "Não achei essa cidade.";
  $("weather-places").replaceChildren(...found.map((place) => {
    const li = el("li");
    const pick = el("button", "place k-state k-type-label", place.label);
    pick.type = "button";
    pick.onclick = async () => {
      await chrome.storage.local.set({ weatherPlace: place });
      paintWeather(place);
    };
    li.append(pick);
    return li;
  }));
};

let tasks = Array.isArray(stored.tasks) ? stored.tasks : [];

async function saveTasks(next) {
  tasks = next;
  await chrome.storage.local.set({ tasks });
  paintTasks();
}

function paintTasks() {
  $("tasks-empty").hidden = tasks.length > 0;
  $("tasks-clear").hidden = !tasks.some((t) => t.done);
  $("task-list").replaceChildren(...tasks.map((task) => {
    const li = el("li", `task${task.done ? " task--done" : ""}`);
    const check = el("button", "task__check k-state");
    check.type = "button";
    const box = el("span", "task__box");
    box.append(Object.assign(el("span", "k-icon"), { textContent: glyph("check") }));
    check.append(box, el("span", "task__text k-type-body", task.text));
    check.onclick = () => saveTasks(tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    const remove = el("button", "task__remove k-icon-button k-icon-button--small k-state");
    remove.type = "button";
    remove.title = "Apagar";
    remove.append(Object.assign(el("span", "k-icon"), { textContent: glyph("x") }));
    remove.onclick = () => saveTasks(tasks.filter((t) => t.id !== task.id));
    li.append(check, remove);
    return li;
  }));
}

$("task-form").onsubmit = (e) => {
  e.preventDefault();
  const text = $("task-input").value.trim();
  if (!text) return;
  $("task-input").value = "";
  saveTasks([...tasks, { id: `t${Date.now().toString(36)}`, text, done: false }]);
};
$("tasks-clear").onclick = () => saveTasks(tasks.filter((t) => !t.done));

async function paintNews(force = false) {
  const state = $("news-state");
  if (force) delete stored.newsCache;
  if (!stored.newsCache) state.replaceChildren(document.createElement("k-loading-indicator"));
  try {
    const news = await cached("newsCache", NEWS_URL, parseNews);
    state.replaceChildren();
    const now = Date.now();
    $("news-list").replaceChildren(...news.slice(0, 18).map((article) => {
      const a = el("a", "article");
      a.href = article.link;
      const source = el("div", "article__source k-type-caption");
      if (article.sourceUrl) source.append(Object.assign(document.createElement("img"), { src: favicon(article.sourceUrl, 32), alt: "" }));
      source.append(el("span", "", [article.source, ago(article.published, now)].filter(Boolean).join(" · ")));
      a.append(source, el("h3", "article__title", article.title));
      return a;
    }));
  } catch {
    const retry = el("button", "k-button k-button--text k-type-button", "Tentar de novo");
    retry.onclick = () => paintNews(true);
    state.replaceChildren(el("p", "hint k-type-label", "Não deu pra carregar as notícias."), retry);
  }
}
$("news-refresh").onclick = (e) => {
  e.currentTarget.querySelector(".k-icon").animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], { duration: 600, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
  paintNews(true);
};

paintIcons();

const themePort = chrome.runtime.connectNative("ranga.theme");
themePort.onMessage.addListener((msg) => {
  if (msg.type === "theme") themeStyle.textContent = msg.css;
  if (msg.type === "location" && settings.newtabCards && !stored.weatherPlace) paintWeather(msg.location);
});
themePort.onDisconnect.addListener(() => {
  if (settings.newtabCards && !placed) paintWeather(null);
});

if (settings.newtabCards) {
  $("weather").hidden = false;
  $("tasks").hidden = false;
  paintTasks();
  if (stored.weatherPlace) paintWeather(stored.weatherPlace);
  else themePort.postMessage({ type: "location" });
}
if (settings.newtabNews) {
  $("news").hidden = false;
  paintNews();
}
