// The Gallery tab (#/<league>/gallery/<sub-tab>): everyone's custom cards first, then your own
// packs, card dex, customizing and recycling as sub-tabs, on a full page with the site's header
// and sub-tab bar. The same code as the collection dialog (parts/collection.js); the address
// follows the open sub-tab.
import { app, pageHead, addressOf, setRoutedAt } from "../core.js";
import { openCollection } from "../parts/collection.js";

const TABS = [["gallery", "Everyone's cards"], ["packs", "Packs"], ["collection", "Collection"], ["customize", "Customize"], ["recycle", "Recycle"]];

export function renderGallery(src, tab) {
  const open = TABS.some(([id]) => id === tab) ? tab : "gallery";
  const bar = `<div class="pp-tabs" role="tablist" aria-label="Gallery sections">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === open}" tabindex="${id === open ? 0 : -1}">${label}</button>`).join("")}</div>`;
  app.innerHTML = `${pageHead(src.kicker, "Gallery", "Everyone's custom cards, rated by the league. Your own packs and cards are in the other tabs.", bar)}<div class="collection-host"></div>`;
  return openCollection({
    page: app.querySelector(".collection-host"), tabBar: app.querySelector(".pp-tabs"), tab: open,
    onTab: (t) => { history.replaceState(history.state, "", addressOf(`${src.root}/gallery${t === "gallery" ? "" : `/${t}`}`)); setRoutedAt(location.href); },
  });
}
