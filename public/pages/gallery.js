// The Cards tab (#/<league>/cards/<sub-tab>, once /gallery): the Feed first, then everyone's
// custom cards, then your own packs, card dex, customizing and recycling as sub-tabs, on a full
// page with the site's header and sub-tab bar. The same code as the collection dialog
// (parts/collection.js); the address follows the open sub-tab.
import { app, pageHead, addressOf, setRoutedAt } from "../core.js";
import { openCollection } from "../parts/collection.js";

// [collection.js tab, label, address segment]
const TABS = [["feed", "Feed", ""], ["gallery", "Gallery", "gallery"], ["packs", "Packs", "packs"], ["collection", "Collection", "collection"], ["customize", "Customize", "customize"], ["recycle", "Recycle", "recycle"]];

export function renderGallery(src, segment) {
  if (segment === "log") segment = ""; // the Feed replaced the Log
  const open = (TABS.find(([, , s]) => s === (segment ?? "")) ?? TABS[0])[0];
  const bar = `<div class="pp-tabs" role="tablist" aria-label="Cards sections">${TABS.map(([id, label]) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === open}" tabindex="${id === open ? 0 : -1}">${label}</button>`).join("")}</div>`;
  app.innerHTML = `${pageHead(src.kicker, "Cards", "What the league is pulling and saving, everyone's custom cards, and your own packs and collection.", bar)}<div class="collection-host"></div>`;
  return openCollection({
    page: app.querySelector(".collection-host"), tabBar: app.querySelector(".pp-tabs"), tab: open,
    onTab: (t) => { const s = TABS.find(([id]) => id === t)[2]; history.replaceState(history.state, "", addressOf(`${src.root}/cards${s ? `/${s}` : ""}`)); setRoutedAt(location.href); },
  });
}
