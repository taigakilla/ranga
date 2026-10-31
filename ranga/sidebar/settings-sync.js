import { configured } from "./sync-auth.js";
import { missingExtensions } from "./sync-model.js";

const $ = (id) => document.getElementById(id);
const PANES = ["sync-off", "sync-save-key", "sync-enter-key", "sync-on"];

function ask(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function show(pane, message = "") {
  for (const id of PANES) $(id).hidden = id !== pane;
  $("sync-message").hidden = !message;
  $("sync-message").textContent = message;
}

function ago(at) {
  if (!at) return "";
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  return new Date(at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusText({ syncAccount, syncState }) {
  const who = syncAccount?.email || "Conta Google";
  if (syncState?.status === "auth") return `${who} · Entre de novo pra continuar sincronizando`;
  if (syncState?.status === "error") return `${who} · Última tentativa falhou: ${syncState.error}`;
  return syncState?.at ? `${who} · Sincronizado ${ago(syncState.at)}` : `${who} · Sincronizando…`;
}

async function paint() {
  const stored = await chrome.storage.local.get(["syncAccount", "syncVault", "syncDevice", "syncState"]);
  const { syncRecovery } = await chrome.storage.session.get("syncRecovery");
  const ready = await configured();
  $("sync-unavailable").hidden = ready;
  $("sync-connect").disabled = !ready;
  if (!stored.syncAccount) return show("sync-off");
  if (syncRecovery) {
    $("sync-recovery").textContent = syncRecovery;
    return show("sync-save-key");
  }
  if (!stored.syncVault) return show("sync-enter-key");
  $("sync-status").textContent = statusText(stored);
  const field = $("sync-device").elements.name;
  if (document.activeElement !== field) field.value = stored.syncDevice?.name ?? "";
  show("sync-on");
}

async function run(type, extra) {
  const result = await ask(type, extra);
  await paint();
  if (result?.error) {
    $("sync-message").hidden = false;
    $("sync-message").textContent = result.error;
  }
}

$("sync-connect").addEventListener("click", () => run("sync-connect"));
$("sync-copy-key").addEventListener("click", () => navigator.clipboard.writeText($("sync-recovery").textContent));
$("sync-key-saved").addEventListener("click", () => run("sync-key-saved"));
$("sync-unlock").addEventListener("submit", (e) => {
  e.preventDefault();
  run("sync-unlock", { recovery: e.target.elements.recovery.value });
});
$("sync-device").addEventListener("submit", (e) => {
  e.preventDefault();
  run("sync-rename", { name: e.target.elements.name.value });
});
$("sync-disconnect").addEventListener("click", () => run("sync-disconnect"));
$("sync-cancel").addEventListener("click", () => run("sync-disconnect"));

async function paintExtensions() {
  const { syncVault, syncDevices } = await chrome.storage.local.get(["syncVault", "syncDevices"]);
  const installed = chrome.management ? (await chrome.management.getAll()).map((e) => e.id) : [];
  const missing = syncVault ? missingExtensions(syncDevices, installed) : [];
  $("sync-extensions").hidden = missing.length === 0;
  $("sync-extensions-list").replaceChildren(...missing.map((ext) => {
    const row = document.createElement("div");
    row.className = "setting";
    const text = document.createElement("span");
    text.className = "text";
    text.append(
      Object.assign(document.createElement("span"), { className: "k-type-panel", textContent: ext.name }),
      Object.assign(document.createElement("span"), { className: "k-type-caption hint", textContent: `Em ${ext.devices.join(", ")}` }),
    );
    const button = Object.assign(document.createElement("button"), { className: "k-button k-button--tonal k-type-button", type: "button", textContent: "Instalar" });
    button.addEventListener("click", () => chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${ext.id}` }));
    row.append(text, button);
    return row;
  }));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.syncAccount || changes.syncVault || changes.syncState || changes.syncDevice)) paint();
  if (area === "local" && (changes.syncVault || changes.syncDevices)) paintExtensions();
});
chrome.management?.onInstalled.addListener(paintExtensions);
chrome.management?.onUninstalled.addListener(paintExtensions);

paint();
paintExtensions();
