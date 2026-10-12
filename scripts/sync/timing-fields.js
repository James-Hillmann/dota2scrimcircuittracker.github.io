// Per-player timing fields for the Compare tab's "Over a game" charts.
//   xp_t    XP at each minute (OpenDota xp_t).
//   tf_dmg  hero damage dealt in each OpenDota teamfight, flat groups of 3: fight start,
//           fight end (seconds), damage. OpenDota keeps no per-minute damage, so teamfights
//           are the only timed damage: about half of all hero damage in S48 (lane harass and
//           solo pickoffs aren't in a teamfight). Fights where they did no damage are left out.
// `d` is the OpenDota match, `p` one of d.players (teamfight players are in d.players order).
export function timingFields(d, p) {
  const i = d.players.indexOf(p);
  const fights = Array.isArray(d.teamfights) ? d.teamfights : null;
  return {
    xp_t: Array.isArray(p.xp_t) ? p.xp_t : null,
    tf_dmg: fights && i >= 0 ? fights.flatMap((f) => { const v = f.players?.[i]?.damage ?? 0; return v > 0 ? [f.start, f.end, v] : []; }) : null,
  };
}
