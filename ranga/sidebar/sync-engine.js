import { newVaultKey, newId, recoveryKey, parseRecoveryKey, seal, open, toBase64, fromBase64 } from "./sync-crypto.js";
import { driveStore } from "./sync-drive.js";
import { configured, signIn, accessToken, revoke } from "./sync-auth.js";
import { loadSettings } from "./settings-model.js";
import { loadContainers } from "./containers-model.js";
import { initialState, spaceOfTab } from "./spaces-model.js";
import {
  deviceTabs, otherDevices, track, detach, merge, resolve, containerItems, applyContainers,
  spaceItems, applySpaces, inboxName, inboxTarget, deviceOf, deviceHistory, mergeHistory, deviceExtensions,
} from "./sync-model.js";
import { roots, bookmarkItems, matchBookmarks, planBookmarks, orderMoves } from "./sync-bookmarks.js";

const ALARM = "ranga-sync";
const KEYS = ["syncAccount", "syncVault", "syncDevice", "syncLedgers", "syncState", "syncDevices", "syncBookmarkIds", "syncHistory", "syncHistoryMark"];
const HISTORY_EVERY = 10 * 60 * 1000;
const HISTORY_DAYS = 30 * 24 * 60 * 60 * 1000;
const WATCHED = ["settings", "containers", "spaces", "pins"];
let running = null;
let again = false;
let soon;
const seen = new Map();

async function stored() {
  return chrome.storage.local.get(KEYS);
}

function storeFor(account) {
  return driveStore({ api: account.dev?.api, token: async (fresh) => {
    try {
      return await accessToken(account, fresh);
    } catch (error) {
      if (error.code === "invalid_grant") await setState({ status: "auth" });
      throw error;
    }
  } });
}

async function setState(patch) {
  const { syncState } = await chrome.storage.local.get("syncState");
  await chrome.storage.local.set({ syncState: { ...syncState, ...patch } });
}

function hostname() {
  return new Promise((resolve) => {
    let port;
    const timer = setTimeout(() => finish(""), 2000);
    function finish(name) {
      clearTimeout(timer);
      try {
        port?.disconnect();
      } catch {}
      resolve(name);
    }
    try {
      port = chrome.runtime.connectNative("ranga.theme");
      port.onMessage.addListener((msg) => { if (msg.type === "hostname") finish(msg.hostname ?? ""); });
      port.onDisconnect.addListener(() => finish(""));
      port.postMessage({ type: "hostname" });
    } catch {
      finish("");
    }
  });
}

async function device() {
  const { syncDevice } = await chrome.storage.local.get("syncDevice");
  if (syncDevice?.id) return syncDevice;
  const fresh = { id: newId(), name: (await hostname()) || "Este computador" };
  await chrome.storage.local.set({ syncDevice: fresh });
  return fresh;
}

export async function connect(dev = null) {
  if (!dev && !(await configured())) throw new Error("Este build do Ranga não tem o cliente do Google configurado.");
  const account = dev ? { dev, email: dev.email ?? "conta de teste" } : await signIn();
  await chrome.storage.local.set({ syncAccount: account, syncState: { status: "setup" } });
  await device();
  const vault = await storeFor(account).read("vault");
  if (vault) return { step: "enter-key" };
  const key = newVaultKey();
  await storeFor(account).write("vault", await seal(key, "vault", { v: 1, created: Date.now() }));
  await chrome.storage.local.set({ syncVault: toBase64(key) });
  await chrome.storage.session.set({ syncRecovery: recoveryKey(key) });
  return { step: "save-key", recovery: recoveryKey(key) };
}

export async function unlock(text) {
  const key = parseRecoveryKey(text);
  if (!key) return { error: "A chave tem 52 letras e números, em grupos de 4." };
  const { syncAccount } = await stored();
  const vault = await storeFor(syncAccount).read("vault");
  try {
    await open(key, "vault", vault);
  } catch {
    return { error: "Essa chave não abre o cofre desta conta." };
  }
  await chrome.storage.local.set({ syncVault: toBase64(key) });
  await start();
  return { step: "ready" };
}

export async function keySaved() {
  await chrome.storage.session.remove("syncRecovery");
  await start();
  return { step: "ready" };
}

export async function disconnect() {
  const { syncAccount, syncDevice } = await stored();
  await chrome.alarms.clear(ALARM);
  seen.clear();
  if (syncAccount && syncDevice) {
    await storeFor(syncAccount).remove(`device-${syncDevice.id}`).catch(() => {});
    await storeFor(syncAccount).remove(`history-${syncDevice.id}`).catch(() => {});
  }
  await revoke(syncAccount);
  await chrome.storage.session.remove("syncRecovery");
  await chrome.storage.local.remove(KEYS);
}

export async function rename(name) {
  const clean = String(name ?? "").trim().slice(0, 40);
  if (!clean) return;
  await chrome.storage.local.set({ syncDevice: { ...(await device()), name: clean } });
  queue();
}

export async function send(target, tab) {
  const { syncAccount, syncVault, syncDevice } = await stored();
  if (!syncVault) return;
  const name = inboxName(target, newId());
  await storeFor(syncAccount).write(name, await seal(fromBase64(syncVault), name, { from: syncDevice.name, url: tab.url, title: tab.title ?? "", at: Date.now() }));
}

async function start() {
  await setState({ status: "ok" });
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  queue();
}

export function queue() {
  if (running) {
    again = true;
    return running;
  }
  running = cycle().catch(async (error) => {
    await setState({ status: error.status === 401 ? "auth" : "error", error: String(error.message ?? error) });
  }).finally(() => {
    running = null;
    if (again) {
      again = false;
      queue();
    }
  });
  return running;
}

async function receive(store, key, self, files) {
  for (const { name } of files) {
    if (inboxTarget(name) !== self.id) continue;
    const bytes = await store.read(name);
    await store.remove(name);
    if (!bytes) continue;
    const message = await open(key, name, bytes).catch(() => null);
    if (!message?.url || !/^https?:\/\//.test(message.url)) continue;
    await chrome.tabs.create({ url: message.url, active: false });
    await chrome.storage.local.set({ syncReceived: { from: message.from, title: message.title, url: message.url, at: Date.now() } });
  }
}

function values(merged) {
  return Object.fromEntries(Object.entries(merged).map(([sid, entry]) => [sid, entry.deleted ? { deleted: true } : entry.value]));
}

async function applyBookmarks(ids, all, { set, remove }) {
  const { ops, folders } = planBookmarks(ids, all, set, remove);
  const next = { ...ids };
  const localOf = () => Object.fromEntries(Object.entries(next).map(([id, sid]) => [sid, id]));
  const [tree] = await chrome.bookmarks.getTree();
  const parents = new Map();
  const index = (node) => (node.children ?? []).forEach((c) => { parents.set(c.id, node.id); index(c); });
  index(tree);
  const fallback = roots([tree]).other?.id;
  for (const op of ops) {
    const local = localOf();
    const parentId = local[op.parent] ?? fallback;
    if (op.op === "remove") {
      await chrome.bookmarks.removeTree(op.id).catch(() => chrome.bookmarks.remove(op.id)).catch(() => {});
      delete next[op.id];
    } else if (op.op === "create") {
      const created = await chrome.bookmarks.create({ parentId, title: op.title, ...(op.url ? { url: op.url } : {}) }).catch(() => null);
      if (created) next[created.id] = op.sid;
    } else {
      await chrome.bookmarks.update(op.id, { title: op.title, ...(op.url ? { url: op.url } : {}) }).catch(() => {});
      if (parentId && parents.get(op.id) !== parentId) await chrome.bookmarks.move(op.id, { parentId }).catch(() => {});
    }
  }
  for (const sid of folders) {
    const local = localOf();
    if (!local[sid]) continue;
    const children = await chrome.bookmarks.getChildren(local[sid]).catch(() => []);
    for (const [child, i] of orderMoves(children.map((c) => next[c.id]), all[sid]?.order ?? [])) {
      await chrome.bookmarks.move(localOf()[child], { parentId: local[sid], index: i }).catch(() => {});
    }
  }
  return next;
}

async function syncBookmarks(previous, merged) {
  const tree = await chrome.bookmarks.getTree();
  const { syncBookmarkIds = {} } = await chrome.storage.local.get("syncBookmarkIds");
  const remote = values(merged);
  let ids = syncBookmarkIds;
  let local = {};
  if (previous) {
    const current = bookmarkItems(tree, ids, newId);
    ids = current.ids;
    local = track(previous, current.items);
  } else {
    await chrome.storage.local.set({ syncBookmarkBackup: { at: Date.now(), tree } });
    ids = matchBookmarks(tree, remote);
  }
  const outcome = resolve(local, merged);
  if (Object.keys(outcome.set).length || outcome.remove.length) ids = await applyBookmarks(ids, { ...remote, ...outcome.set }, outcome);
  const final = bookmarkItems(await chrome.bookmarks.getTree(), ids, newId);
  const live = new Set();
  const walk = (node) => { live.add(node.id); (node.children ?? []).forEach(walk); };
  (await chrome.bookmarks.getTree()).forEach(walk);
  await chrome.storage.local.set({ syncBookmarkIds: Object.fromEntries(Object.entries(final.ids).filter(([id]) => live.has(id))) });
  return track(outcome.ledger, final.items);
}

async function publishHistory(store, key, self) {
  const { syncHistoryMark } = await chrome.storage.local.get("syncHistoryMark");
  const now = Date.now();
  if (syncHistoryMark && now - syncHistoryMark.at < HISTORY_EVERY) return;
  const items = deviceHistory(await chrome.history.search({ text: "", startTime: now - HISTORY_DAYS, maxResults: 2000 }));
  const newest = items[0]?.at ?? 0;
  if (syncHistoryMark && syncHistoryMark.newest === newest) return;
  const name = `history-${self.id}`;
  await store.write(name, await seal(key, name, { items }));
  await chrome.storage.local.set({ syncHistoryMark: { at: now, newest } });
}

async function readHistory(store, key, self, files, docs) {
  const names = new Map(docs.map((d) => [d.id, d.name]));
  const lists = [];
  for (const { name, modified } of files) {
    const id = /^history-([0-9a-f]+)$/.exec(name)?.[1];
    if (!id || id === self.id || !names.has(id)) continue;
    if (seen.get(name)?.modified !== modified) seen.set(name, { modified, doc: await open(key, name, await store.read(name)).catch(() => null) });
    lists.push({ device: names.get(id), items: seen.get(name).doc?.items });
  }
  const merged = mergeHistory(lists);
  const { syncHistory = [] } = await chrome.storage.local.get("syncHistory");
  if (JSON.stringify(merged) !== JSON.stringify(syncHistory)) await chrome.storage.local.set({ syncHistory: merged });
}

async function cycle() {
  const { syncAccount, syncVault, syncLedgers = {} } = await stored();
  if (!syncAccount || !syncVault) return;
  const key = fromBase64(syncVault);
  const store = storeFor(syncAccount);
  const self = await device();
  const local = await chrome.storage.local.get(["settings", "containers", "spaces", "pins"]);
  const settings = loadSettings(local.settings);
  const containers = loadContainers(local.containers);
  const spaces = local.spaces ?? initialState();
  const pins = local.pins ?? {};
  const files = await store.list();

  const docs = [];
  for (const { name, modified } of files) {
    const id = deviceOf(name);
    if (!id || id === self.id) continue;
    if (seen.get(name)?.modified !== modified) seen.set(name, { modified, doc: await open(key, name, await store.read(name)).catch(() => null) });
    if (seen.get(name).doc) docs.push(seen.get(name).doc);
  }

  const sources = docs.map((d) => ({ device: d.id, ledgers: d.ledgers ?? {} }));
  const remote = (kind) => merge(sources.map((s) => ({ device: s.device, ledger: s.ledgers[kind] })));
  const before = (kind, items, off = []) => (syncLedgers[kind] ? track(detach(syncLedgers[kind], off), items) : {});
  const ledgers = { containers: syncLedgers.containers, spaces: {}, bookmarks: syncLedgers.bookmarks };
  const writes = {};

  if (settings.syncContainers) {
    const outcome = resolve(before("containers", containerItems(containers)), remote("containers"));
    const list = Object.keys(outcome.set).length || outcome.remove.length ? applyContainers(containers, outcome) : containers;
    if (list !== containers) writes.containers = list;
    ledgers.containers = track(outcome.ledger, containerItems(list));
  }

  if (settings.syncBookmarks) ledgers.bookmarks = await syncBookmarks(syncLedgers.bookmarks, remote("bookmarks"));

  const unsynced = (state) => state.spaces.filter((s) => !s.sync).map((s) => s.id);
  const outcome = resolve(before("spaces", spaceItems(spaces, pins), unsynced(spaces)), remote("spaces"));
  let current = spaces;
  let currentPins = pins;
  if (Object.keys(outcome.set).length || outcome.remove.length || outcome.detached.length) {
    ({ state: current, pins: currentPins } = applySpaces(spaces, pins, outcome));
    writes.spaces = current;
    writes.pins = currentPins;
  }
  ledgers.spaces = track(detach(outcome.ledger, unsynced(current)), spaceItems(current, currentPins));
  if (Object.keys(writes).length) await chrome.storage.local.set(writes);

  const nameOf = (tab) => current.spaces.find((s) => s.id === spaceOfTab(current, tab.id, tab.windowId))?.name ?? "";
  const tabs = settings.syncTabs ? deviceTabs(await chrome.tabs.query({}), nameOf) : [];
  const extensions = settings.syncExtensions ? deviceExtensions(await chrome.management.getAll(), chrome.runtime.id) : [];
  const doc = { id: self.id, name: self.name, at: Date.now(), tabs, extensions, ledgers };
  const name = `device-${self.id}`;
  await store.write(name, await seal(key, name, doc));
  await receive(store, key, self, files);
  if (settings.syncHistory) await publishHistory(store, key, self);
  else if ((await chrome.storage.local.get("syncHistoryMark")).syncHistoryMark) {
    await store.remove(`history-${self.id}`);
    await chrome.storage.local.remove("syncHistoryMark");
  }
  const others = otherDevices(docs, self.id);
  await readHistory(store, key, self, files, others);
  await chrome.storage.local.set({
    syncLedgers: ledgers,
    syncDevices: others.map(({ id, name: label, at, tabs: list, extensions: exts }) => ({ id, name: label, at, tabs: list ?? [], extensions: exts ?? [] })),
    syncState: { status: "ok", at: Date.now() },
  });
}

function later() {
  clearTimeout(soon);
  soon = setTimeout(async () => {
    const { syncAccount, syncVault } = await chrome.storage.local.get(["syncAccount", "syncVault"]);
    if (syncAccount && syncVault) queue();
  }, 5000);
}

export function init() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) queue();
  });
  chrome.storage.local.get(["syncAccount", "syncVault"]).then(({ syncAccount, syncVault }) => {
    if (syncAccount && syncVault) queue();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && WATCHED.some((key) => changes[key])) later();
  });
  chrome.tabs.onUpdated.addListener((_id, change) => {
    if (change.url) later();
  });
  chrome.tabs.onRemoved.addListener(later);
  for (const event of ["onCreated", "onRemoved", "onChanged", "onMoved"]) chrome.bookmarks[event].addListener(later);
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    const handlers = {
      "sync-connect": () => connect(msg.dev),
      "sync-unlock": () => unlock(msg.recovery),
      "sync-key-saved": () => keySaved(),
      "sync-disconnect": () => disconnect(),
      "sync-rename": () => rename(msg.name),
      "sync-send": () => send(msg.device, msg.tab),
      "sync-now": () => queue(),
    };
    const handler = handlers[msg?.type];
    if (!handler) return false;
    handler().then((result) => reply(result ?? {}), (error) => reply({ error: String(error.message ?? error) }));
    return true;
  });
}
