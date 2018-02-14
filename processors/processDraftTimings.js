/**
 * This processor grabs the draft timings from the parsed replay.
 * This is ideally to be used only for captain modes formats.
 * The output is:
 * order: the order of the pick or ban (1-20) (10 bans and 10 picks)
 * pick: whether the draft stage was a pick or ban. pick == true, ban == false
 * active_team: the active team during the draft stage (2 or 3) if 0 then not captains mode
 * hero_id: the id of the hero banned or picked in the draft stage
 * player_slot: null for bans, the player_slot assoicated with the hero_id
 * time: removed for total time taken
 * extra_time: how much of the extra time is left at the end of the draft stage
 * total_time_taken: the time taken for the draft stage
 * extra_time_taken: the amount of extra time used in the draft stage - Now done client side
 */

function processDraftTimings(entries, meta) {
  const draftTimings = [];
  const heroIdToSlot = meta.hero_id_to_slot;
  const sumActiveTeam = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const heroId = e.hero_id;
    if (e.type === 'draft_timings') {
      sumActiveTeam = i < entreies.length - 1 ? sumActiveTeam + e.draft_active_team : sumActiveTeam;
      const currpickban = {
        order: e.draft_order,
        pick: e.pick,
        active_team: i > 0 ? entries[i-1].draft_active_team : null,
        hero_id: e.hero_id,
        player_slot: e.pick === true ? heroIdToSlot[heroId] : null, 
        time: e.time,
        extra_time: e.draft_active_team === 2 ? e.draft_extime0 : e.draft_extime1,
        total_time_taken: 0,
        /* extra_time_taken: 0, */
      };
      draftTimings.push(JSON.parse(JSON.stringify(currpickban)));
    }
  }
  // update the team that had the first pick/ban
  draftTimings[0].active_team = sumActiveTeam % 2 + 2;
  for (let j = 0; j < draftTimings.length; j += 1) {
    const pnb = draftTimings[j];
    const team = pnb.active_team;
    let previousorder = 0;
    // find previous pick or ban from that team
    for (let i = 0; i < draftTimings.length; i += 1) {
      const currpick = draftTimings[i];
      if (currpick.order < pnb.order && currpick.order > previousorder &&
          currpick.active_team === team) {
        previousorder = currpick.order;
      }
    }
    // for the first bans there are no previous draft stages, so use
    if (pnb.order === 1) {
      draftTimings[j].total_time_taken = (meta.game_zero + pnb.time);
      // draftTimings[j].extra_time_taken = (130 - pnb.extra_time);
    } else if (pnb.order === 2) {
      let ind2;
      // find the time of the end of the previous order
      for (let i = 0; i < draftTimings.length; i += 1) {
        const currpick = draftTimings[i];
        if (currpick.order === (pnb.order - 1)) {
          ind2 = i;
        }
      }
      // calculate the timings
      const thepastpick = draftTimings[ind2];
      draftTimings[j].total_time_taken = (pnb.time - thepastpick.time);
      // draftTimings[j].extra_time_taken = (130 - pnb.extra_time);
    } else {
      /* let ind;
      // find which row is the previous order
      for (let i = 0; i < draftTimings.length; i += 1) {
        const currpick = draftTimings[i];
        if (currpick.order === previousorder) {
          ind = i;
        }
      } */
      let ind2;
      // find the time of the end of the previous order
      for (let i = 0; i < draftTimings.length; i += 1) {
        const currpick = draftTimings[i];
        if (currpick.order === (pnb.order - 1)) {
          ind2 = i;
        }
      }
      // calculate the timings
      const thepastpick = draftTimings[ind2];
      // const pastpicks = draftTimings[ind];
      draftTimings[j].total_time_taken = (pnb.time - thepastpick.time);
      // draftTimings[j].extra_time_taken = (pastpicks.extra_time - pnb.extra_time);
    }
  }
  // remove the time, no need for it
  for (let i = 0; i < draftTimings.length; i += 1) {
    delete draftTimings[i].time;
  }
  return draftTimings;
}
module.exports = processDraftTimings;
