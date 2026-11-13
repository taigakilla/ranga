let pending = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "notice-action" || msg.id !== pending?.id) return;
  const { run } = pending;
  pending = null;
  run();
});

export async function toast(message, action, icon = "info") {
  pending = action ? { id: crypto.randomUUID(), run: action.run } : null;
  const { id: windowId } = await chrome.windows.getCurrent();
  chrome.rangaPrivate.showNotice(windowId, icon, message, action?.label ?? "", pending?.id ?? "", () => void chrome.runtime.lastError);
}
