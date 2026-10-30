import { call } from "./ranga-private.js";

export async function dropTab(windowId, tabId, zone, split, partner = null) {
  if (zone === "window") {
    if (split) await chrome.tabs.unsplit(split);
    await chrome.windows.create({ tabId, focused: true });
    return;
  }
  const other = partner && await chrome.tabs.get(partner).catch(() => null);
  if (!split || (other && other.splitViewId !== split)) {
    if (!other || other.splitViewId > 0) return;
    if (split) await chrome.tabs.unsplit(split);
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    const target = await chrome.tabs.get(other.id).catch(() => null);
    if (!tab || !target) return;
    await chrome.tabs.move(tabId, { index: tab.index < target.index ? target.index : target.index + 1 });
    await chrome.tabs.createSplit([other.id, tabId]);
  }
  await call("arrangeSplit", windowId, tabId, zone);
}

export async function joinWindow(windowId, tabId, zone, partner) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  if (tab.splitViewId > 0) await chrome.tabs.unsplit(tab.splitViewId);
  const other = partner && await chrome.tabs.get(partner).catch(() => null);
  const pair = zone !== "join" && other?.windowId === windowId && !(other.splitViewId > 0);
  await chrome.tabs.move(tabId, { windowId, index: pair ? other.index + 1 : -1 });
  if (pair) {
    await chrome.tabs.createSplit([other.id, tabId]);
    await call("arrangeSplit", windowId, tabId, zone);
  } else {
    await chrome.tabs.update(tabId, { active: true });
  }
  await chrome.windows.update(windowId, { focused: true });
}
