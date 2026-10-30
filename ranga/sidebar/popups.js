const POPUPS = ".k-menu, .favorites-popover, .space-form";

export function setupPopups(root = document.body) {
  const popups = [...root.querySelectorAll(POPUPS)];
  const observer = new MutationObserver((records) => {
    for (const { target } of records) {
      if (target.hidden) continue;
      const fromContext = target.id === "context-menu";
      for (const other of popups) {
        if (other === target || other.hidden || (fromContext && other.classList.contains("favorites-popover"))) continue;
        other.dispatchEvent(new Event("dismiss"));
        if (!other.hidden) other.hidden = true;
      }
    }
  });
  for (const el of popups) observer.observe(el, { attributes: true, attributeFilter: ["hidden"] });
}
