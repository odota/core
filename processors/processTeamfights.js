/**
 * A processor to compute teamfights that occurred given an event stream
 **/
const populate = require('./populate');

function processTeamfights(entries, meta) {
  let curr_teamfight;
  let teamfights = [];
  const intervalState = {};
  const teamfight_cooldown = 15;
  const hero_to_slot = meta.hero_to_slot;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.type === 'killed' && e.targethero && !e.targetillusion) {
      // check teamfight state
      curr_teamfight = curr_teamfight || {
        start: e.time - teamfight_cooldown,
        end: null,
        last_death: e.time,
        deaths: 0,
        players: Array(...new Array(10)).map(() => {
          return {
            deaths_pos: {},
            ability_uses: {},
            item_uses: {},
            killed: {},
            deaths: 0,
            buybacks: 0,
            damage: 0,
            healing: 0,
            gold_delta: 0,
            xp_delta: 0,
          };
        }),
      };
      // update the last_death time of the current fight
      curr_teamfight.last_death = e.time;
      curr_teamfight.deaths += 1;
    } else if (e.type === 'interval') {
      // store hero state at each interval for teamfight lookup
      if (!intervalState[e.time]) {
        intervalState[e.time] = {};
      }
      intervalState[e.time][e.slot] = e;
      // check curr_teamfight status
      if (curr_teamfight && e.time - curr_teamfight.last_death >= teamfight_cooldown) {
        // close it
        curr_teamfight.end = e.time;
        // push a copy for post-processing
        teamfights.push(JSON.parse(JSON.stringify(curr_teamfight)));
        // clear existing teamfight
        curr_teamfight = null;
      }
    }
  }
  // fights that didnt end wont be pushed to teamfights array (endgame case)
  // filter only fights where 3+ heroes died
  teamfights = teamfights.filter((tf) => {
    return tf.deaths >= 3;
  });
  teamfights.forEach((tf) => {
    tf.players.forEach((p, ind) => {
      // record player's start/end xp for level change computation
      if (intervalState[tf.start] && intervalState[tf.end]) {
        p.xp_start = intervalState[tf.start][ind].xp;
        p.xp_end = intervalState[tf.end][ind].xp;
      }
    });
  });
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    // check each teamfight to see if this event should be processed as part of that teamfight
    for (let j = 0; j < teamfights.length; j++) {
      const tf = teamfights[j];
      if (e.time >= tf.start && e.time <= tf.end) {
        if (e.type === 'killed' && e.targethero && !e.targetillusion) {
          populate(e, tf);
          // reverse the kill entry to find killed hero
          const r = {
            time: e.time,
            slot: hero_to_slot[e.key],
          };
          if (intervalState[r.time] && intervalState[r.time][r.slot]) {
            // if a hero dies, add to deaths_pos, lookup slot of the killed hero by hero name (e.key), get position from intervalstate
            const x = intervalState[r.time][r.slot].x;
            const y = intervalState[r.time][r.slot].y;
            // fill in the copy
            r.type = 'deaths_pos';
            r.key = JSON.stringify([x, y]);
            r.posData = true;
            populate(r, tf);
            // increment death count for this hero
            tf.players[r.slot].deaths += 1;
          }
        } else if (e.type === 'buyback_log') {
          // bought back
          if (tf.players[e.slot]) {
            tf.players[e.slot].buybacks += 1;
          }
        } else if (e.type === 'damage') {
          // sum damage
          // check if damage dealt to hero and not illusion
          if (e.targethero && !e.targetillusion) {
            // check if the damage dealer could be assigned to a slot
            if (tf.players[e.slot]) {
              tf.players[e.slot].damage += e.value;
            }
          }
        } else if (e.type === 'healing') {
          // sum healing
          // check if healing dealt to hero and not illusion
          if (e.targethero && !e.targetillusion) {
            // check if the healing dealer could be assigned to a slot
            if (tf.players[e.slot]) {
              tf.players[e.slot].healing += e.value;
            }
          }
        } else if (e.type === 'gold_reasons' || e.type === 'xp_reasons') {
          // add gold/xp to delta
          if (tf.players[e.slot]) {
            const types = {
              gold_reasons: 'gold_delta',
              xp_reasons: 'xp_delta',
            };
            tf.players[e.slot][types[e.type]] += e.value;
          }
        } else if (e.type === 'ability_uses' || e.type === 'item_uses') {
          // count skills, items
          populate(e, tf);
        } else {
          continue;
        }
      }
    }
  }
  return teamfights;
}
module.exports = processTeamfights;
