// A player's feedback tickets on their profile: open ones, and ones Fav implemented in the last
// week (store.js ticketStatus; scripts/feedback.cjs links and closes them). Nothing shows when
// there are none.
import { esc } from "../core.js";
import { ticketStatus } from "../lib/store.js";

export async function mountProfileTickets(host, account) {
  const list = await ticketStatus(account);
  if (!list.length || !host.isConnected) return;
  const section = document.createElement("section");
  section.className = "profile-tickets panel";
  section.innerHTML = `<h3>Feedback</h3>
    <ul>${list.map((t) => `<li class="${t.status}"><span class="pt-status">${t.status === "implemented" ? "Implemented" : "Open"}</span>
      <span class="pt-note">${esc(t.note || "(no note)")}</span>
      <small>${esc(t.id)} · sent ${t.sent?.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? ""}${t.done ? ` · done ${t.done.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</small></li>`).join("")}</ul>`;
  (host.querySelector(".profile-collection") ?? host.querySelector(".page-head"))?.after(section);
}
