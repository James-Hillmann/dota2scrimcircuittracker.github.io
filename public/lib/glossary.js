import { METRICS, VERSIONS, LIVE, PODIUM_STATS } from "./tiers.js";

// Info bubbles: a small "i" next to a stat's label that explains it. One popover for the
// whole page; hover shows it with a mouse, tap/click pins it (the only way on phones),
// Escape or a click elsewhere closes it. Obvious labels (K, D, A, Games, Win %) get none.

// The tier-list bubbles whose numbers come from a scoring version: tm_x for the live one,
// tm_x@<version> for the others (the tier list's Model tab). See tierInfo.
function tierBubbles(v, at) {
  const x = (n) => `×${n.toFixed(Number.isInteger(Math.round(n * 1e6) / 1e4) ? 2 : 3)}`, mid = ([a, b]) => (a + b) / 2, m = v.mult;
  return {
    [`tm_stat100${at}`]: `The stat on a 0–100 scale: 100 = the league's best average for the role (players with 3+ games), 0 = the worst single series by such a player, so a weak stat reads low instead of 0. Averages are padded with ${v.k_shrink} games at the position average, so short records don't swing to the ends. Support stacks are easier: 100 sits ${Math.round((v.ease.support?.stacks ?? 1) * 100)}% of the way from the worst stacker to the best.`,
    [`tm_survival${at}`]: `Deaths, time spent dead and hero damage taken per life, each against the same position, as one 0–100. Scales the stat points from ${x(m.survival[0])} (0) to ${x(m.survival[1])} (100)${m.survival[1] === 1 ? ": dying less keeps more of what you earned" : ""}.${v.survival_pos ? ` Pos ${Object.keys(v.survival_pos).join(" and ")} (initiators) lose at most ${Math.round((1 - Object.values(v.survival_pos)[0].range[0]) * 100)}%, and damage taken per life weighs most for them.` : ""}`,
    [`tm_consistency${at}`]: v.consistency_top
      ? `How many of the player's series reach the league's top ${Math.round(v.consistency_top * 100)}% of series at their position (padded with ${v.k_consistency} series at the league's rate). The most reliable player in the league is ${x(m.consistency[1])}, the least ${x(m.consistency[0])}.`
      : `How much the player's stat points swing from series to series (±), pulled toward the typical swing for short records. The steadiest player in the league is ${x(m.consistency[1])}, the streakiest ${x(m.consistency[0])}.`,
    [`tm_opponents${at}`]: v.opponents_by === "rating"
      ? `How strong each opponent is: a team rating from the division's game results, adjusted for who each team beat and refitted without the series being scored. The strongest team is ${x(m.opponents[1])}, the weakest ${x(m.opponents[0])}. The shown % is the average opponent's strength (0% weakest, 100% strongest); the multiplier weights each series by its stat points.`
      : `Each opponent's game win % against other teams (padded with ${v.k_prior} even games): 75% → ${x(m.opponents[1])}, 50% → ${x(mid(m.opponents))}, 25% → ${x(m.opponents[0])}. The shown % is the average opponent; the multiplier weights each series by its stat points, so big series against strong teams count more.`,
    [`tm_winning${at}`]: `${v.win_parts.win === 2 && v.win_parts.speed === 1 ? "Two parts win rate to one part win speed" : `${v.win_parts.win} parts win rate to ${v.win_parts.speed} win speed`}, as a 0–100. Win rate is padded with ${v.k_prior} even games, then 25% → 0 and 75% → 100; win speed scores each win by the share of this league's wins that took longer. ${v.winning_flat ? `Flat points added after the multipliers, the same for every player: 0 → ${v.winning_flat[0]}, 50 → ${(v.winning_flat[0] + v.winning_flat[1]) / 2}, 100 → +${v.winning_flat[1]}.` : `50 → ${x(mid(m.winning))}, 100 → ${x(m.winning[1])}, 0 → ${x(m.winning[0])}.`}`,
    ...(v.podium ? { [`tm_podium${at}`]: `A bonus for impressive numbers: ${Array.isArray(v.podium.stats) ? `the league's top three averages a game in ${v.podium.stats.map((m) => PODIUM_STATS[m].label).join(", ")} (raw numbers, any position)` : `the top three averages a game among cores (pos 1–3) or supports (pos 4–5), in that role's podium stats (raw numbers; listed in "How it's scored")`} get ${v.podium.points.map((n, i) => `+${n} for ${["1st", "2nd", "3rd"][i]}`).join(", ")}, added after the multipliers and before the rating curve.` } : {}),
    [`tm_curve${at}`]: `Everything above this row comes from your own games. This row compares you with the rest of the league. Scores bunch up (the typical player lands near 60), so a curve spreads them out: the league's median score rates 50, one curve width above rates 84, two rate 98, one below rates 16, and 0 and 100 stay nearly out of reach. The curve is ${v.stretch} × the spread of the league's scores wide. The number here is the rating minus the score, so the column adds up to your rating.`,
  };
}
// A tier-list bubble for a scoring version: its own text when the numbers differ from the live one.
export const tierInfo = (id, version) => info(version && version !== LIVE && INFO[`${id}@${version}`] ? `${id}@${version}` : id);

export const INFO = {
  // Tier-list breakdown (one bubble per stat comes from METRICS in tiers.js)
  ...Object.fromEntries(Object.entries(METRICS).map(([m, d]) => [`tm_${m}`, d.def])),
  tm_avg: "The league average for the same position. GPM and net worth are matched to this player's game length, since both climb as games go on.",
  tm_points: "Stat rows: points out of the 100 stat points (the stat's points × its 0–100); the most it can give is after the slash. Multiplier rows: the points it adds or takes away (its × factor underneath). All rows add up to the score.",
  ...tierBubbles(VERSIONS[LIVE], ""),
  ...Object.fromEntries(Object.keys(VERSIONS).filter((k) => k !== LIVE).flatMap((k) => Object.entries(tierBubbles(VERSIONS[k], `@${k}`)))),
  tm_series: "Stats: the series' stat points, padded the same way as the season (a great series can pass 100). Opp.: that opponent's strength factor. Score: stats × opp. × the season's survival, consistency and winning. Weighted by games, the series average to the season row.",
  // Series standings (AD2L)
  w: "Series won 2–0.",
  tie: "Series tied 1–1. AD2L series are two games, so ties are common.",
  l: "Series lost 0–2.",
  game_rate: "Games won ÷ games played.",
  tracked: "Games whose full stats were found on OpenDota. A game can be missing when nobody in it has public match history.",
  record: "Series won–tied–lost.",
  sos: "AD2L's count: the total game wins of every opponent this team has played (a team met twice counts twice, a bye counts 0). First tiebreaker for playoff seeding. Higher = tougher opponents so far.",
  faced: "Every series played, oldest first: green won, red lost, gold tied. Hover a square for the score.",
  remaining_sos: "Total game wins so far of the opponents still to play. Only the posted week counts, since pairings come out week by week. Higher = harder run-in.",
  series_form: "The last five series, newest on the right: green won, red lost, gold tied. Sorting ranks wins minus losses over those five.",
  model_rating: "Team strength from game results so far, pulled toward the average medal of its top three players (medals have predicted better than results so far). 0 = an average team. The gap between two teams sets the Predict odds.",
  standings_leader: "Most games won; game win % breaks a tie.",
  standings_streak: "Most series won in a row, counting back from the latest.",
  standings_upset: "The 2–0 result the model thought least likely, using only the results from before that series.",

  // Scrim standings
  gp: "Games played, private scrims included.",
  kill_diff: "Average kill score difference per game: the team's kills minus the opponent's.",
  form: "The last five games, oldest first.",
  streak: "Current run of wins (W) or losses (L), e.g. W3 = three wins in a row.",

  // Player stats (across games)
  kda: "(Kills + assists) ÷ deaths, over all games. Zero deaths counts as one.",
  avg_gpm: "Gold per minute over all games: total gold ÷ total minutes, so long games count for more than short ones.",
  avg_xpm: "Experience per minute over all games: total XP ÷ total minutes.",
  dmg_per_min: "Damage to enemy heroes ÷ minutes played.",
  dmg_per_1k_nw: "Hero damage per 1,000 net worth: how much damage a player gets out of their gold. Supports often score high.",
  avg_kp: "Kill participation: (kills + assists) ÷ team kills, averaged over games.",
  dmg_taken_pg: "Damage taken from enemy heroes per game (parsed replays). Creeps, towers and neutrals don't count.",
  buybacks_pg: "Buybacks per game (parsed replays).",
  stacks_pg: "Neutral camps stacked per game (parsed replays).",
  obs_pg: "Observer wards placed per game (parsed replays).",
  sen_pg: "Sentry wards placed per game (parsed replays).",
  dewards_pg: "Enemy observer and sentry wards killed per game (parsed replays).",
  lane_pg: "Lane creeps killed per game (parsed replays).",
  neutral_pg: "Neutral creeps killed per game (parsed replays).",
  neutral_share: "Neutral creeps as a share of all creeps killed (lane + neutral). High = farms the jungle.",
  roshans: "Roshan last hits, total.",
  tormentors: "Tormentor last hits, total.",
  pub_games: "Public and ranked games since the last league night, smurf accounts included, as of the last sync.",
  pub_win_rate: "Win % in those recent pubs.",
  pub_kda: "(Kills + assists) ÷ deaths in those recent pubs.",
  pub_heroes: "Heroes played in those recent pubs, most played first.",

  // One game
  net_worth: "Gold held plus the value of items at the end of the game.",
  last_hits: "Last hits: creeps killed for gold.",
  gpm: "Gold per minute in this game.",
  xpm: "Experience per minute in this game.",
  hero_damage: "Damage dealt to enemy heroes.",
  dmg_share: "Share of the team's total hero damage.",
  kill_participation: "Kill participation: (kills + assists) ÷ the team's kills.",
  hero_healing: "Healing done to allied heroes.",
  lane_kills: "Lane creeps killed.",
  neutral_kills: "Neutral creeps killed.",
  ancient_kills: "Ancient creeps killed.",
  camps_stacked: "Neutral camps stacked.",
  obs_placed: "Observer wards placed.",
  new_vision: "Share of the map outside the team's base that this player's observers lit first for their team, averaged over the game. Trees, cliffs and high ground block a ward's sight. The team's five add up to its Vision chart average.",
  sen_placed: "Sentry wards placed.",
  obs: "Observer wards placed.",
  sen: "Sentry wards placed.",
  stacks: "Neutral camps stacked.",
  dewards: "Enemy observer and sentry wards killed.",
  roshan_kills: "Roshan last hits. The chips above show which team took each one.",
  tormentor_kills: "Tormentor last hits.",

  // Heroes and drafts
  pick_rate: "Share of games (with stats) it was picked in.",
  ban_rate: "Bans ÷ drafted games.",
  contest_rate: "Share of drafted games it was picked or banned in. The best single measure of how much teams care about a hero.",
  b1: "Bans in draft phase 1: the opening 7 bans.",
  b2: "Bans in draft phase 2: the 3 bans between the first 2 picks and the next 6.",
  b3: "Bans in draft phase 3: the last 4 bans.",
  p1_ban_share: "Share of its bans that came in phase 1. High = teams remove it on sight.",
  p1: "Picks in phase 1: the first 2 picks of the draft.",
  w1: "Win % when picked in phase 1.",
  p2: "Picks in phase 2: the middle 6 picks.",
  w2: "Win % when picked in phase 2.",
  p3: "Picks in phase 3: the last 2 picks, one per team.",
  w3: "Win % when picked in phase 3 (last pick).",
  avg_damage: "Average hero damage per game on this hero.",
  avg_kda: "Average of each game's KDA on this hero.",
  team_hero_wr: "That team's record when they picked this hero.",
  team_bans: "Times this team banned it.",
  banned_against: "Times opponents banned it against this team.",
  first_pick: "Games won by the team with the first pick of the draft.",
  top_p1_ban: "Banned most in phase 1 (the opening 7 bans). Below: how many of its bans came in phase 1.",
  top_p1_pick: "Picked most in phase 1 (the first 2 picks), with its record when picked there.",
  last_pick: "A team's fifth and final pick. It comes last, so it can counter everything already on the board.",
  best_last_pick: "Best record as a team's last pick, among heroes last-picked 3+ times.",
  draft_slot: "Average position of its pick in the draft, counting all 24 steps (bans and picks). Lower = taken earlier.",
  by_draft_pick: "Record by which of the team's five picks the hero was (1st … last). A big last-pick gap means it works best as a counter-pick. Under each record: average game rating (0–100), KDA, GPM, damage per minute and kill participation from that slot, green or red when clearly above or below the hero's all-slot average.",
  team_side_pick: "How often the team plays Radiant and picks first, with its record each way. In Captains Mode one team chooses side or first pick and the other gets the remaining choice, so a lean shows what this team takes, or what opponents leave it. The line under the bars shows their side when picking first or second.",
  draft_by_phase: "Bans, bans against and picks by draft phase. Phase 1 = opening 7 bans and first 2 picks, phase 2 = 3 bans and 6 picks, phase 3 = last 4 bans and last 2 picks. Count = times. % of drafts = how often it comes up. Win % = the team's record in those games (for picks, with the hero).",
  hero_phases: "When this hero gets banned or picked in Captains Mode drafts, split by phase.",

  // Player / team cards
  tier: "Tier list rank (S–D) among players with 3+ games. Rating 0–100: S 85+, A 65+, B 40+, C 20+. Tier rating, below, breaks down the score. Full method: “How it's scored” on the Players page.",
  vision: "Observer / sentry wards placed per game.",
  creeps: "Lane / neutral creeps killed per game, and the neutral share of all creeps.",
  objectives: "Roshan / Tormentor last hits, total.",
  avg_kills: "Average kills per game by this team; the line below is kills against them.",
  team_roshans: "Share of the Roshans killed in their games that they took. The bar: taken (green) vs given up (red).",
  first_roshan: "Of the games where Roshan died, how many this team took the first one.",
  team_tormentors: "Share of the Tormentors killed in their games that they took. The bar: taken (green) vs given up (red).",
  lead10: "Average gold lead at 10 minutes, in games with replay data. Above zero = usually ahead after laning.",
  lead20: "Average gold lead at 20 minutes, their games that lasted that long.",
  team_wards: "Observers / sentries placed per game by the whole team.",
  team_dewards: "Enemy wards killed per game by the whole team.",
  team_stacks: "Camps stacked per game by the whole team.",
  ahead20: "Record in games where they had more gold at 20 minutes.",
  behind20: "Record in games where they had less gold at 20 minutes.",
  comebacks: "Wins after trailing by 5k+ gold at some point.",
  throws: "Losses after leading by 5k+ gold at some point.",

  // Weekly / match
  core_items: "Core items: anything built from parts for 1,000+ gold, plus Blink Dagger and Aghanim's Shard. A part later built into something bigger (Yasha into Manta) counts as the bigger item. Times are when the item was finished.",
  lead_swing: "The team's gold lead change in the 3 minutes after the item was finished, minus the change in the 3 minutes before, averaged over games, from the buyer's side. Positive = the lead turned their way. It's timing, not cause: an item finished during a won fight gets the credit, and teams already ahead finish items sooner.",
  items_fights: "The gold lead over the game with every teamfight and core item on the same clock. Bands and circles are teamfights: circle size = deaths, colour = the side that lost fewer (grey = even). Icons above are the top team's core items, below the bottom team's, at the second each was finished. Hover a circle for deaths per side and how the lead moved; hover an item for the lead change in the 3 minutes before and after.",
  fastest_core: "This week's item finish furthest ahead of the league average for the same item on the same hero. Only the hero's usual builds count: 2,000+ gold items finished in at least half its games (3 or more).",
  mvp: "A game's MVP is the winning-side player with the best average of damage share, kill participation and net-worth share. Player of the week has the most MVPs.",
  biggest_comeback: "The biggest gold lead a team lost the game from this week.",
  team_damage: "Total hero damage by each team.",
  gold_lead: "Gold difference between the teams at each minute. Each side's biggest lead is marked, as are Roshans and Tormentors.",
  gold_players: "Each player's gold at each minute. Net worth is gold held plus item value and matches the end scoreboard. Gold earned is everything picked up before spending, so it only rises and ends above net worth by what went on consumables, buybacks and gold lost to deaths.",
  gold_curve: "Average gold at each minute against the division's average core and support. Core = a team's top 3 by net worth, support = the other 2.",
  team_gold: "Gold lead at each minute, their side positive. Thin lines are each game (green won, red lost; click to open); the bold line is the average, drawn while at least half the games are still going. Cards rank the team against the league.",
  ward_map: "Where wards were placed. Both sides: Radiant and Dire games together, with Dire games mirrored so own base is bottom left. As Radiant / As Dire: only games on that side, at their real spots.",
  match_wards: "Every ward both teams placed.",
  vision_map: "What each team's observer wards could see at the moment on the slider, or play it through. Trees, cliffs and high ground block a ward's sight; ground no ward sees is fogged. Optional: towers still standing and what they see, sentries' true-sight rings, and night (towers see less at night; observers don't). Trees cut during the game aren't tracked, so every tree counts as standing.",
  vision_chart: "How much of the map outside its own base each team's observers showed at each minute. Trees, cliffs and high ground block sight. Trees cut during the game aren't tracked, so every tree counts as standing. Sentries don't count.",
  tower_map: "Which towers and barracks were still standing at the end of each game phase, and when each one fell.",
  lane_players: "Each player's first 10 minutes. Roaming = moved between lanes. Lead is the whole lane's gold + XP at 10:00 against the other side of that lane. Roamers don't count in the lane they left. When one side has more heroes (a 1v2), the cores are compared instead.",
  lane_record: "Lanes won, drawn and lost. A lane is judged at 10:00 on its gold + XP lead, with cut-offs fitted to this division: a third of lanes are won, a third lost.",
  lane_rate: "Lanes won ÷ lanes judged, with a drawn lane counting as half a win.",
  lane_margin: "Average gold + XP lead at 10:00 of the whole lane (you and your lane partners against the other side of it). Roamers don't count in the lane they left; uneven lanes (a 1v2) compare the cores.",
  lane_lh: "Last hits and denies at 10:00, averaged over games.",
  lane_deaths: "Deaths and kills before 10:00.",
  lane_convert: "Of the lanes won, how many ended in a won game.",
  lane_rank: "Players ranked on laning within the position they played: safe lane cores, mids, off lane cores and supports. Only players with 3+ lanes in that position.",
  lane_best_week: "The highest lane score in this week's games (2+ lanes, or 1 if nobody has 2): average gold + XP lead at 10:00 ÷ the won cut-off, so mid and side lanes compare fairly.",
  lane_best_season: "The highest season lane score with 3+ lanes: average gold + XP lead at 10:00 ÷ the won cut-off, padded with 2 drawn lanes so a short record doesn't top the list.",
  fight_deaths: "Left: where each hero died in a teamfight. Only teamfight deaths have a recorded spot, so lane deaths and pickoffs aren't on the map. Right: every death on a time axis, one row per hero. Deaths outside a teamfight count as lane deaths before 10:00 and pickoffs after.",
  player_deaths: "Where and when this player dies, over every parsed game. Map: teamfight deaths (the only ones with a recorded spot) in Radiant or Dire games, picked with the As Radiant / As Dire switch. Chart: deaths per 2-minute stretch, split into lane deaths (before 10:00, outside a teamfight), pickoffs (after 10:00, outside a teamfight) and teamfight deaths. Filter to wins or losses to compare.",
  team_fights: "Where this team fights, from the spot of every teamfight death in their parsed games, theirs and the enemy's. Both sides mirrors Dire games so own base is bottom left. As Radiant / As Dire: only games on that side, at their real spots. Heat = where fights happen. Net = where they come out ahead (green) or behind (red). Fights = each teamfight, coloured by who lost more heroes.",
  smoke_map: "Kills made out of Smoke of Deceit. Left: where each smoke gank ended (the victim's spot, teamfight deaths only). Right: every smoked kill on a time axis, a row per team, with bands for teamfights where a team used a smoke. When and where a smoke was used isn't recorded, only how many each player used.",
  team_smokes: "Kills out of Smoke of Deceit in this team's parsed games, by them and their opponents. Map: where each gank ended (teamfight deaths only). Both sides mirrors Dire games so own base is bottom left. Chart: smoked kills by game minute. Per game: smokes used, kills out of smoke and their share of all kills.",
  map_objectives: "Creeps, stacks, wards and objectives per player.",
  stat_leaders: "The top and bottom 3 in this league on the stat you pick, among players with 3+ games. Per-game stats are totals over games played. A badge means the player is also top or bottom 3 across all seven AD2L leagues together (Heroic/Aegis counted once, as Combined). Raw numbers, no adjustment for how strong each league is. The role filter keeps players whose most-played position fits; the badges then compare that role across the leagues.",
  stat_ranks: "This player's place on each stat among players with 3+ games: in this league, and across all seven AD2L leagues together. Colour by league place: gold, silver, bronze for the top 3, green for the top 10, soft green for the top 25, red for the bottom 3. The same colours mark the all-leagues place.",
  team_ranks: "This team's place on each stat among teams with 3+ games with stats: in this division, and across all seven AD2L leagues together. Team numbers add up all five players a game (team GPM is the five GPMs summed). Win % here counts only games with stats, so it can differ from the PlayOn record. Colours as on a player's Stat ranks: gold, silver, bronze for the top 3, green for the top 10, red for the bottom 3.",
  hero_ranks: "This hero's place on each stat among heroes picked 3+ times: in this league, and across all seven AD2L leagues together. Stats cover every game anyone played on it. Pick, contest and ban rates are per game with stats or per Captains Mode draft. Highlighted tiles are top or bottom 3.",
  hero_deaths: "Where and when this hero dies, over every parsed game anyone played it. Map: teamfight deaths (the only ones with a recorded spot) in Radiant or Dire games, picked with the As Radiant / As Dire switch. Chart: deaths per 2-minute stretch, split into lane deaths (before 10:00, outside a teamfight), pickoffs (after 10:00, outside a teamfight) and teamfight deaths. Filter to wins or losses to compare.",
  hero_pubs: "This division's rostered players on this hero in public and ranked games in the 14 days before the last sync. Players with a private match history are missing.",
  hero_towers: "Every tower, barracks and Ancient over the parsed games this hero was in, with its team's base always bottom left (Dire games flipped). Each building shows how often it fell and its average fall time; a gold ring means this hero last-hit it at least once. Filter to wins or losses to compare. Denies don't count as taken or lost.",
  building_dmg: "Damage to towers, barracks and the Ancient, averaged over their games with stats, and their share of their team's building damage in those games.",
  player_towers: "Every tower, barracks and Ancient over this player's parsed games, with their team's base always bottom left (Dire games flipped). Each building shows how often it fell and its average fall time; a gold ring means this player last-hit it at least once. Filter to wins or losses to compare. Denies don't count as taken or lost.",
  game_analysis: "One game at a time: pick any game above or hit Analyze in the table below. Stat places are among the ten players in that game. Wards need a parsed replay; kills and deaths are on the gold chart (only where the replay has a death log).",
  game_gold: "Total gold earned by minute (gold lost on death isn't subtracted), against the enemy player at the same position. Kills and deaths sit on their gold line; Roshan, Tormentors, towers and barracks are on the map lane (their team's above the line, the enemy's below); shaded bands are teamfights. Lead = their team's total gold lead.",
  game_rating: "The tier rating from this one game: the same stats and multipliers as the tier list, against this league's players at the same position. Its curve is fitted to every game in the league, so games spread across S–D in about the same shares as players.",
  hero_power_list: "Heroes ranked S–D by how well players perform on them: the average hero rating of everyone who played it, weighted by games and padded with 3 games at the league median. The averages sit close together, so a curve spreads them out (median hero = 50). It measures performance on the hero, not win rate or draft priority.",
  hero_tier_list: "Every player on every hero, ranked S–D by hero rating: the tier rating from just their games on that hero, against this league's players at the same position. Pairs need 2+ games on the hero by default (change it with the menu); the hero menu narrows it to one hero.",
  plus_level: "Dota Plus hero level, from STRATZ, refreshed with every sync. The badge is the in-game tier: Bronze 1–5, Silver 6–11, Gold 12–17, Platinum 18–24, Master 25–29, Grandmaster 30. STRATZ lists levels from 11 up, so lower ones and private profiles show none. On a game, the badge is the level the player had when it was played.",
  hero_rating: "The tier rating from a player's games on this hero only: the same stats, multipliers and curve as the tier list, against this league's players at the same position. Opponent strength uses all the league's games. Short records are padded toward the average, but one game can still rate very high or very low. Across leagues, each player is measured against their own league.",
    tier_list: "One list per position: players with 3+ games, listed under the position they play most and ranked S–D against the others on that list. Games at other positions still count, each compared with the position played in it. Score = stat points out of 100 (each stat compared with the same position) × survival × consistency × opponent strength × winning; the rating puts that on a curve. Click a player for every point.",
  time_machine: "Counts only the picked weeks: standings, team pages, player stats, tiers and heroes use those weeks' games and series. Pick one week, several, or weeks 1 to N to see the league as it stood then. Cross-league ranks and lane cut-offs use the same weeks. With one or two weeks picked, players need only that many games to be ranked (3 otherwise).",
  strength_of_schedule: "How tough each team's opponents have been, and how tough the rest of the schedule is.",
  recent_pubs: "Public and ranked games in the 14 days before the last sync, smurf accounts included.",
  pub_record: "Wins–losses in recent pubs.",

  // Predictions
  points: "Correct calls / series called.",
  bracket_pts: "Playoffs: 1 point for each bracket match whose winner you picked, from the bracket you saved on the Bracket tab before the first bracket match. Week 8 tiebreakers count as series picks instead.",
  correct: "Share of calls that were right.",
  model_col: "What the model would have picked, using only results from before it. Where shown, the % is the chance it gave the actual result.",
  crowd_col: "The most-picked call, and how many people picked.",
  you_col: "Your call, matched by the name you pick with.",
  model_draft: "Two drafts for this series, with one First pick switch for both. Best draft: Sybil's draft model drafting both teams, with the chance to win before and after it. Likely draft: the guess at all 24 steps from each team's habits, game 1 or game 2; hover any step for why it was chosen.",
  player_pools: "Each player's likeliest heroes: league games (recent weeks count most) plus pubs since the last league night, discounted by the chance the other team bans it. % = rough chance they play it.",

  // Combat (parsed replays)
  apm: "Actions per minute: every order given to a unit (move, attack, cast, buy…). Measures how busy the hands are, not how good the play is.",
  tf_part: "Share of their team's teamfights they took part in.",
  best_streak: "Most hero kills without dying in one game. 3 is a Killing Spree, 5 a Mega Kill, 7 Wicked Sick, 9 Godlike, 10+ Beyond Godlike, as the game announces them.",
  rampages: "Five hero kills in quick succession, as the game announces it. Ultra kill = four, triple = three, double = two.",
  ultras: "Four hero kills in quick succession, as the game announces it.",
  fb_rate: "Share of games where they got the first hero kill of the game.",
  runes_pg: "Runes picked up a game: bounty, power runes (haste, double damage, illusion, invisibility, regeneration, arcane, shield), water and wisdom.",
  max_hit: "The biggest single instance of damage they dealt to an enemy hero, and what dealt it (an ability, an item or a right-click).",
  courier_kills: "Enemy couriers killed (last hit).",
  pings: "Map pings over the game: the minimap alerts players send their team.",
  pings_pg: "Map pings a game: the minimap alerts players send their team.",
  death_sources: "What got the last hit on each death: an enemy hero, a tower (or the fountain), lane creeps, neutral creeps, or Roshan and other units. Only games whose replay logged every death.",
  benchmarks: "Each stat against public games on the same hero, averaged over their games: 70th percentile = better than 70% of them. Compared with the whole public player base, not this league.",
  streak_chart: "Every run of kills without dying, as a line that climbs one step per kill and drops at the death that ended it. Hover a line, a portrait, a dot or an × for who, when and who ended it.",
  first_blood: "The first hero kill of the game: who got it, when (negative = before the horn) and on whom.",
  pub_prep: "Their league games split by whether they'd played that hero in a public or ranked game in the 7 days before. Only games late enough that the full week before is in the pub log.",
  skill_build: "Which ability got each skill point, level by level, over every game on this hero in this league.",
  hero_with: "The hero's record in games where the other hero was on its team.",
  hero_against: "The hero's record in games against the other hero.",
  hero_neutrals: "The neutral item in its slot at the end of each game, and its record in those games.",
  team_sides: "Record by side of the map. Radiant starts bottom left and picks from its own side of the draft.",
  team_standins: "Record in games where at least one player wasn't on their roster, against games with the roster only.",
  team_first_blood: "How often they got the first hero kill of the game, and how often they won those games.",
  team_fight_rate: "Teamfights (3+ deaths close together) where they lost fewer heroes than the other team, out of those that weren't even.",
  aegis_steals: "Roshan's Aegis picked up by the team that didn't kill him.",
  team_length: "Record by how long the game ran.",
  hero_grid: "Dota's hero grid (the picker in the pick screen) can hold your own layouts. Boxes sit where they do in Dota, with heroes shrunk to fit. Red boxes are the enemy, grey are bans against them, green are your team (set My team here or under the settings cog). Pick a template or customise one: drag a box by its name bar, resize it from the corner, drag heroes in from anywhere on the page, onto another hero to put them there, or off a box to take them out. Click a box to rename it or change what it holds or which side it reads. Bottom-right number: games (threats: the model's chance to win with it; bans: points it adds to them). Green outline and top-left number: pubs on that hero in the last 30 days. Saved in this browser; your file never leaves it.",
  team_pairs: "Every two players who played together for this team, and their record together.",
  lead_conversion: "Record in games where they were ahead (or behind) on gold at that minute. Games that ended before it don't count.",
  medal_rating: "Each player's PlayOn medal against their tier-list rating. The dashed line is what players of each medal usually rate here; the names are the farthest above and below it.",
  fb_win_rate: "How often the team that got the first hero kill went on to win, over every game with kill logs.",
  fb_death_rate: "Share of games where they were first blood's victim.",
  radiant_rate: "How often Radiant (bottom left) won, over every game with a draft.",
  pauses: "The game with the most paused time this week.",
};

export function info(id) {
  if (!INFO[id]) return "";
  return `<button type="button" class="info" data-info="${id}" aria-label="What is this?" aria-expanded="false">i</button>`;
}

let pop = null, owner = null, pinned = false;

function place() {
  const r = owner.getBoundingClientRect(), gap = 8, edge = 12;
  pop.style.left = "0px"; pop.style.top = "0px";
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(edge, r.left + r.width / 2 - w / 2), window.innerWidth - w - edge);
  const below = r.bottom + gap + h <= window.innerHeight - edge || r.top - gap - h < edge;
  pop.style.left = `${left}px`;
  pop.style.top = `${below ? r.bottom + gap : r.top - gap - h}px`;
}

function show(btn, pin) {
  if (owner && owner !== btn) hide();
  owner = btn;
  pinned = pin;
  pop.textContent = INFO[btn.dataset.info] ?? "";
  pop.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  btn.setAttribute("aria-describedby", "info-pop");
  place();
}

function hide() {
  if (!owner) return;
  owner.setAttribute("aria-expanded", "false");
  owner.removeAttribute("aria-describedby");
  owner = null;
  pinned = false;
  pop.hidden = true;
}

export function wireInfo() {
  pop = document.createElement("div");
  pop.id = "info-pop";
  pop.className = "info-pop";
  pop.setAttribute("role", "tooltip");
  pop.hidden = true;
  document.body.append(pop);

  // Capture phase, so a bubble inside a sortable header, a <summary> or a link card opens
  // itself instead of sorting, toggling or navigating.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".info");
    if (btn) {
      e.preventDefault(); e.stopPropagation();
      if (owner === btn && pinned) hide(); else show(btn, true);
      return;
    }
    // Not on clicks in the guided tour's caption, which may be pointing at this bubble.
    if (owner && !pop.contains(e.target) && !e.target.closest?.(".tour")) hide();
  }, true);

  const canHover = window.matchMedia?.("(hover: hover)").matches;
  if (canHover) {
    document.addEventListener("mouseover", (e) => {
      const btn = e.target.closest?.(".info");
      if (btn && !pinned) show(btn, false);
    });
    document.addEventListener("mouseout", (e) => {
      const btn = e.target.closest?.(".info");
      if (btn && btn === owner && !pinned && !btn.contains(e.relatedTarget)) hide();
    });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && owner) { const b = owner; hide(); b.focus(); } });
  window.addEventListener("scroll", () => owner && (pinned ? place() : hide()), { passive: true, capture: true });
  window.addEventListener("resize", () => owner && place());
  window.addEventListener("hashchange", hide);
}
