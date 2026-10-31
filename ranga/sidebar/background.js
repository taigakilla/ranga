import { plan, archiveEntry, pushArchive } from "./lifecycle-model.js";
import { loadSettings } from "./settings-model.js";
import { cleanUrl, markdownLink } from "./link-model.js";
import { toMap } from "./shortcuts-model.js";
import { peekTabs } from "./peek-model.js";
import { shouldAutoPip } from "./player-model.js";
import { init as initSync } from "./sync-engine.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.downloads.setUiOptions({ enabled: false }).catch(() => {});
chrome.alarms.create("ranga-lifecycle", { periodInMinutes: 1 });

async function runLifecycle() {
  const stored = await chrome.storage.local.get(["settings", "spaces", "archive"]);
  const settings = loadSettings(stored.settings);
  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const { pinLive = {}, containerLive = {} } = await chrome.storage.session.get(["pinLive", "containerLive"]);
  const { sleep, archive } = plan(tabs, now, settings, new Set([...Object.keys(pinLive), ...Object.keys(containerLive)].map(Number)));
  for (const id of sleep) chrome.tabs.discard(id).catch(() => {});
  if (!archive.length) return;
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const entries = archive.map((id) => archiveEntry(byId.get(id), stored.spaces?.tabSpace?.[id] ?? null, now));
  await chrome.storage.local.set({ archive: pushArchive(stored.archive, entries), lastArchived: { at: now, reason: "idle", entries } });
  await chrome.tabs.remove(archive);
}

async function copyToClipboard(text) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["CLIPBOARD"], justification: "Copiar a URL da aba atual" });
  }
  await chrome.runtime.sendMessage({ type: "offscreen-copy", text });
}

async function copyCurrentUrl() {
  const window = await chrome.windows.getLastFocused();
  const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
  if (!tab?.url) return;
  await copyToClipboard(tab.url);
  rangaCall("executeCommand", window.id, "linkCopied");
}

async function copyLink(tabId, format) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab?.url) return;
  const text = format === "copyMarkdown" ? markdownLink(tab.title, tab.url) : format === "copyCleanLink" ? cleanUrl(tab.url) : tab.url;
  await copyToClipboard(text);
  rangaCall("executeCommand", tab.windowId, "linkCopied");
}

async function applyShortcuts() {
  if (!chrome.rangaPrivate?.setShortcuts) return;
  const { shortcuts } = await chrome.storage.local.get("shortcuts");
  chrome.rangaPrivate.setShortcuts(toMap(shortcuts), () => void chrome.runtime.lastError);
}

async function applyLinks() {
  if (!chrome.rangaPrivate?.setPeekTabs) return;
  const settings = loadSettings((await chrome.storage.local.get("settings")).settings);
  const { pinLive } = await chrome.storage.session.get("pinLive");
  chrome.rangaPrivate.setPeekTabs(peekTabs(pinLive, settings.peekPinnedLinks), () => void chrome.runtime.lastError);
  chrome.rangaPrivate.setOpenLinksInLittle(settings.littleWindowLinks, () => void chrome.runtime.lastError);
}

function rangaCall(name, ...args) {
  return new Promise((resolve) => chrome.rangaPrivate[name](...args, (result) => {
    void chrome.runtime.lastError;
    resolve(result);
  }));
}

async function autoPip({ tabId, windowId }) {
  const { activeTabs = {}, autoPipTab = null } = await chrome.storage.session.get(["activeTabs", "autoPipTab"]);
  const left = activeTabs[windowId];
  await chrome.storage.session.set({ activeTabs: { ...activeTabs, [windowId]: tabId } });
  if (!chrome.rangaPrivate?.getMediaSessions) return;
  if (!loadSettings((await chrome.storage.local.get("settings")).settings).autoPip) return;
  if (autoPipTab === tabId) {
    await chrome.storage.session.set({ autoPipTab: null });
    rangaCall("mediaAction", tabId, "exitPip");
    return;
  }
  if (left == null || left === tabId) return;
  if (!shouldAutoPip((await rangaCall("getMediaSessions", windowId)) ?? [], left)) return;
  await chrome.storage.session.set({ autoPipTab: left });
  rangaCall("mediaAction", left, "pip");
}

async function acceptServicesSchema() {
  if (!chrome.settingsPrivate) return;
  const consent = await chrome.settingsPrivate.getPref("helium.services.user_consented").catch(() => null);
  const schema = await chrome.settingsPrivate.getPref("helium.services.schema_version").catch(() => null);
  if (consent?.value && schema && schema.value < 1) await chrome.settingsPrivate.setPref("helium.services.schema_version", 1).catch(() => {});
}

applyShortcuts();
applyLinks();
acceptServicesSchema();
initSync();
chrome.runtime.onStartup.addListener(() => {
  applyShortcuts();
  applyLinks();
  acceptServicesSchema();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.shortcuts) applyShortcuts();
  if ((area === "local" && changes.settings) || (area === "session" && changes.pinLive)) applyLinks();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "copy-link" && msg.tabId) copyLink(msg.tabId, msg.format);
  if (msg?.type === "links") applyLinks();
});

chrome.tabs.onActivated.addListener(autoPip);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ranga-lifecycle") runLifecycle();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "copy-url") copyCurrentUrl();
});
