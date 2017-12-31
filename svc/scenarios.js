const queue = require('../store/queue');
const buildMatch = require('../store/buildMatch');
const db = require('../store/db');
const async = require('async');
const util = require('util');

function processScenarios(matchID, cb) {
  buildMatch(matchID, (err, match) => {
    if (err) {
      cb(err);
    }
    console.log(match.match_id);
    

    scenarioChecks.forEach( function(scenarioCheck) {
      const rows = scenarioCheck(match);
      async.eachSeries(rows, (row, cb) => {
        const values = Object.keys(row.columns).map(() =>
          '?');
        const query = util.format(
          `INSERT INTO %s (%s) VALUES (%s) ON CONFLICT ON CONSTRAINT ${row.table}_constraint DO UPDATE SET wins = ${row.table}.wins + ${row.won ? 1 : 0}, games = ${row.table}.games + 1`,
          row.table,
          Object.keys(row.columns).join(','),
          values,
        );
        console.log(query)
        console.log(Object.keys(row.columns).map(key =>
          row.columns[key]))
        db.raw(query, Object.keys(row.columns).map(key =>
          row.columns[key])).asCallback(cb);
      });
    })
    /*
    async.eachSeries(isRadiantScenarioChecks, (func, cb) => {
      scenario = func(match)
      if (scenario.condition) {
        const {name, won} = scenario
      db.raw(`INSERT INTO isRadiant_scenarios VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET wins = isRadiant_scenarios.wins + ${won ? 1 : 0}, games = isRadiant_scenarios.games + 1`, [name, 0, 0]).asCallback(cb);
    }}); */
    cb();
  });
}

const itemTimingConditions = [{ hero: 1, item: 'bfury', time: 10050 }, 
{ hero: 1, item: 'power_treads', time: 10050 }, 
{ hero: 88, item: 'arcane_boots', time: 10050 },
{ hero: 88, item: 'tpscroll', time: 10050 }

];

const scenarioChecks = [

function itemTimings(match) {

  const rows = [];

  itemTimingConditions.forEach((c) => {
    const player = match.players.find(h => h.hero_id === c.hero);
    if (player) {
      const item = player.purchase_log.find(i => i.key === c.item);
      if (item && item.time < c.time) {
        const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
        rows.push({
          columns:
                {
                  scenario: "Item Timing",
                  hero: c.hero,
                  item: c.item,
                  time: c.time,
                  patch: match.patch,
                  game_mode: match.game_mode,
                  region: match.region,
                  lobby_type: match.lobby_type,
                },
          won,
          table: 'scenarios',
        });
      }
    }
  });
  return rows;
},
function firstBlood(match) {
  let isRadiant;
  let won;
  const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
  if (condition) {
    isRadiant = condition.player_slot < 5;
  }
  won = match.radiant_win === isRadiant;
  return [{
    columns:
          {
            scenario: "First Blood",
            is_radiant: isRadiant,
            patch: match.patch,
            game_mode: match.game_mode,
            lobby_type: match.lobby_type,
            region: match.region
          },
          won,
          table: 'team_scenarios',
  }]
},
function courierKill(match) {
  let isRadiant;
  let won;
  const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180000);
  if (condition) {
    isRadiant = condition.isRadiant === 3;
  }
  won = match.radiant_win === isRadiant;
  return [{
    columns:
          {
            scenario: "Courier Kill",
            is_radiant: isRadiant,
            patch: match.patch,
            game_mode: match.game_mode,
            lobby_type: match.lobby_type,
            region: match.region
          },
          won,
          table: 'team_scenarios',
  }]
},
];
/*
const isRadiantScenarioChecks = [
  function firstBlood(match) {
    let isRadiant;
    let won;
    const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
    if (condition) {
      isRadiant = condition.player_slot < 5;
    }
    won = match.radiant_win === isRadiant;
    return {
      name: 'First Blood',
      condition,
      won,
    };
  },
  function courierKill(match) {
    let isRadiant;
    let won;
    const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180000);
    if (condition) {
      isRadiant = condition.isRadiant === 3;
    }
    won = match.radiant_win === isRadiant;
    return {
      name: 'Courier Kill',
      condition,
      won,
    };
  },
];

/*
function isRadiantScenarioChecks()  {

  return
  [
  function firstBlood(match, row) {
    console.log(match.match_id);
    let isRadiant;
    let won;
    const fb = match.find((x) => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
    if (fb) {
      isRadiant = fb.key === 2 ? 1 : 0;
    }
    won = match.radiant_win === isRadiant;
  },

];
}
*/
queue.runQueue('scenariosQueue', 1, processScenarios);

