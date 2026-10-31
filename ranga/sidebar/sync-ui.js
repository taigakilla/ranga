let connected = false;
let devices = [];
const listeners = new Set();

function load({ syncAccount, syncVault, syncDevices }) {
  connected = Boolean(syncAccount && syncVault);
  devices = connected ? syncDevices ?? [] : [];
  for (const listener of listeners) listener();
}

export function syncConnected() {
  return connected;
}

export function syncDevices() {
  return devices;
}

export function onSyncChange(listener) {
  listeners.add(listener);
  listener();
}

export function sendEntries(tabs) {
  const urls = tabs.filter((t) => /^https?:\/\//.test(t.url || ""));
  if (!urls.length || !devices.length) return [];
  return [{
    icon: "send",
    label: "Enviar para",
    submenu: devices.map((device) => ({
      icon: "laptop",
      label: device.name,
      action: () => { for (const tab of urls) chrome.runtime.sendMessage({ type: "sync-send", device: device.id, tab: { url: tab.url, title: tab.title } }); },
    })),
  }];
}

export async function initSyncUi(received) {
  load(await chrome.storage.local.get(["syncAccount", "syncVault", "syncDevices"]));
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (changes.syncAccount || changes.syncVault || changes.syncDevices) load(await chrome.storage.local.get(["syncAccount", "syncVault", "syncDevices"]));
    if (changes.syncReceived?.newValue) received(changes.syncReceived.newValue);
  });
}
