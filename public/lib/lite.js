// A division file trimmed for the pages that only need its ranks: the overall stat leaders,
// player and hero ranks across every league, and the header search. Drops what only that
// division's own pages draw (timelines, ward and building maps, items, pubs) and keeps every
// field the stat and rating code reads. test/lite.test.js checks the ranks come out the same.
// Written at deploy by scripts/deploy/lite-data.js as data/<division>-lite.json.
import { LANE_END_MIN } from "./lanes.js";

const GAME_DROP = ["buildings", "objectives", "xp_adv", "gold_adv", "fights", "pauses", "vision", "fight_smokes"];
const PLAYER_DROP = ["sen_pos", "items", "item_times", "networth_t", "max_hit", "bench", "smoke_kill_t", "xp_t", "tf_dmg"];

export function liteDivision(d) {
  const { pubs, ...rest } = d;
  return {
    ...rest,
    games: d.games.map((g) => {
      const out = { ...g };
      for (const k of GAME_DROP) delete out[k];
      if (g.players) out.players = g.players.map((p) => {
        const q = { ...p };
        for (const k of PLAYER_DROP) delete q[k];
        // The laning numbers read gold at the end of the laning stage only.
        if (Array.isArray(q.gold_t)) q.gold_t = q.gold_t.slice(0, LANE_END_MIN + 1);
        return q;
      });
      return out;
    }),
  };
}
