// Privacy: what the site stores, where, and how to get something taken down. Plain list, kept
// to what the code really does (lib/store.js for the database, lib/visits.js for counts).
import { app, pageHead, setTitle } from "../core.js";

export function renderPrivacy() {
  setTitle("Privacy");
  app.innerHTML = `${pageHead("AD2L Stat Tracker", "Privacy")}
  <div class="privacy">
    <p>A free fan site run by Fav. No accounts, no ads, nothing sold. This page lists what the site keeps and where.</p>

    <h2>League stats</h2>
    <p>Standings, games, player names, Steam account IDs and recent public matches come from
      <a href="https://dota.playon.gg/" target="_blank" rel="noopener">PlayOn</a> and
      <a href="https://www.opendota.com/" target="_blank" rel="noopener">OpenDota</a>, both already public. A sync copies them here regularly.</p>

    <h2>What you type in</h2>
    <p>These are saved to a Google Firebase database and shown to everyone on the site:</p>
    <ul>
      <li><b>Predictions and brackets</b>: the name you type and your picks.</li>
      <li><b>Uploaded games</b>: the teams, heroes, players and stats read from your screenshots. The screenshots themselves stay in your browser. A private scrim saves only the teams, winner, kill score and length.</li>
      <li><b>Casts</b>: the link and the caster's name.</li>
      <li><b>Scheduled scrims</b>: the two teams, the start time and the format.</li>
    </ul>
    <p><b>Feedback</b> isn't shown on the site: your name, your notes and pictures of the pages you marked go to Fav, and may be posted in the league Discord to follow up.</p>

    <h2>Your browser</h2>
    <p>Firebase gives each browser a random ID, with no name or email, so you can edit or delete what you added. Settings (theme, colour-blind mode, my team, hero grids, the name you last typed) are kept in your browser's own storage. There are no advertising or tracking cookies.</p>

    <h2>Visit counts</h2>
    <p>Page views may be counted with <a href="https://www.goatcounter.com/" target="_blank" rel="noopener">GoatCounter</a>: which page was opened, with no cookies and nothing that identifies you.</p>

    <h2>Getting something removed</h2>
    <p>Want your name, a prediction, an upload, a cast or a feedback ticket taken down? Ask Fav on the
      <a href="https://discord.gg/rPWa2tvt9k" target="_blank" rel="noopener">Discord</a>. Stats that come from PlayOn or OpenDota are theirs to change; once they do, the next sync picks it up.</p>
  </div>`;
}
