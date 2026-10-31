import { glyph } from "./kurobe/icons.mjs";

const menu = document.getElementById("context-menu");
const submenu = Object.assign(document.createElement("ul"), { id: "context-submenu", className: menu.className, hidden: true });
submenu.setAttribute("role", "menu");
menu.after(submenu);
let openFor = null;

function hideSubmenu() {
  submenu.hidden = true;
  openFor?.classList.remove("k-menu__item--open");
  openFor = null;
}

export function hideMenu() {
  menu.hidden = true;
  hideSubmenu();
}

function place(list, x, y, origin = [x, y]) {
  list.style.visibility = "hidden";
  list.hidden = false;
  const { offsetWidth: width, offsetHeight: height } = list;
  const left = Math.max(8, Math.min(x, innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, innerHeight - height - 8));
  list.style.left = `${left}px`;
  list.style.top = `${top}px`;
  list.style.transformOrigin = `${origin[0] - left}px ${origin[1] - top}px`;
  list.hidden = true;
  list.style.visibility = "";
  requestAnimationFrame(() => { list.hidden = false; });
}

function openSubmenu(li, entries) {
  if (openFor === li) return;
  hideSubmenu();
  openFor = li;
  li.classList.add("k-menu__item--open");
  fill(submenu, entries);
  const rect = li.getBoundingClientRect();
  place(submenu, rect.right - 24, rect.top, [rect.right - 24, rect.top + rect.height / 2]);
}

function fill(list, entries) {
  list.replaceChildren(...entries.map((entry) => {
    if (entry === "divider") {
      const hr = document.createElement("li");
      hr.className = "k-menu__divider";
      hr.setAttribute("role", "separator");
      return hr;
    }
    if (entry.heading) {
      const title = document.createElement("li");
      title.className = "k-menu__heading k-type-caption";
      title.setAttribute("role", "presentation");
      title.textContent = entry.heading;
      return title;
    }
    const li = document.createElement("li");
    li.className = "k-menu__item k-state k-type-label" + (entry.danger ? " k-menu__item--danger" : "");
    li.setAttribute("role", "menuitem");
    li.innerHTML = `<span class="k-icon"></span><span class="k-menu__label"></span>`;
    li.firstChild.textContent = glyph(entry.icon);
    li.children[1].textContent = entry.label;
    if (entry.submenu) {
      li.setAttribute("aria-haspopup", "menu");
      li.insertAdjacentHTML("beforeend", `<span class="k-icon k-menu__chevron"></span>`);
      li.lastChild.textContent = glyph("chevron-right");
      li.onmouseenter = () => openSubmenu(li, entry.submenu);
      li.onclick = (e) => {
        e.stopPropagation();
        openSubmenu(li, entry.submenu);
      };
      return li;
    }
    if (list === menu) li.onmouseenter = hideSubmenu;
    li.onclick = (e) => {
      e.stopPropagation();
      hideMenu();
      entry.action();
    };
    return li;
  }));
}

export function showMenu(entries, x, y) {
  hideSubmenu();
  fill(menu, entries);
  place(menu, x, y);
}

document.addEventListener("click", hideMenu);
document.addEventListener("contextmenu", (e) => { if (!menu.contains(e.target) && !submenu.contains(e.target)) hideMenu(); }, true);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!submenu.hidden) hideSubmenu();
  else hideMenu();
});
window.addEventListener("blur", hideMenu);
