const queue = require('../store/queue');
const buildMatch = require('../store/buildMatch');
const db = require('../store/db');
const async = require('async');
const utility = require('../util/utility');

function processScenarios(matchID, cb) {
  buildMatch(matchID, (err, match) => {
    if (err) {
      cb(err)
    }
    console.log(match.match_id);
    const rows = scenarioChecks.itemTimings()

    async.eachSeries(rows, (row, cb) => { 
      const values = Object.keys(row.columns).map(() =>
      '?');
      const query = util.format(
        `INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (scenario) DO UPDATE SET wins = team_scenarios.wins + ${row.won ? 1 : 0}, games = team_scenarios.games + 1`,
        row.table,
        Object.keys(row.columns).join(','),
        values,
      );

      db.raw(query, Object.keys(row.columns).map(key =>
        row.columns[key])).asCallback(cb);
    });
/*
    async.eachSeries(teamScenarioChecks, (func, cb) => { 
      scenario = func(match)
      if (scenario.condition) {
        const {name, won} = scenario
      db.raw(`INSERT INTO team_scenarios VALUES (?, ?, ?) ON CONFLICT(scenario) DO UPDATE SET wins = team_scenarios.wins + ${won ? 1 : 0}, games = team_scenarios.games + 1`, [name, 0, 0]).asCallback(cb);
    }});*/
    cb();
   
  });
}

const scenarioChecks = [
  function itemTimings(match){
    const hit = [{hero: 1,item: 'bfury' ,time: 1004}]

    const rows = []

    hit.forEach(function (c) {
      const player = match.players.find(h=> h.hero_id === c.hero)
      if (player) {
        const item = player.purchase_log.find(i => i.key === c.item)
        if (item && item.time < c.time) {
          const won = (player.player_slot < 5 && match.radiant_win) ||  (player.player_slot > 4 && !match.radiant_win)
          rows.push({
              columns:
                {scenario: c.stringify(),
                hero: c.hero_id,
                item: c.item,
                time: c.time,},
              won,
              table: 'scenarios'
            })          
        }
      }    
    })
    return rows
  }
]

/*
const teamScenarioChecks = [
  function firstBlood(match) {
    let team;
    let won;
    const condition = match.objectives.find(function(x){return x.type === 'CHAT_MESSAGE_FIRSTBLOOD'});
    if (condition) {
      team = condition.player_slot < 5 ? true : false;
    }
    won = match.radiant_win === team;
    return {
      name: "First Blood",
      condition,
      won,
    }
  },
  function courierKill(match) {
    let team;
    let won;
    const condition = match.objectives.find(function(x){return x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180000});
    if (condition) {
      team = condition.team === 3 ? true : false;
    }
    won = match.radiant_win === team;
    return {
      name: "Courier Kill",
      condition,
      won,
    }
  },
];*/

/*
function teamScenarioChecks()  {

  return
  [
  function firstBlood(match, row) {
    console.log(match.match_id);
    let team;
    let won;
    const fb = match.find((x) => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
    if (fb) {
      team = fb.key === 2 ? 1 : 0;
    }
    won = match.radiant_win === team;
  },

];
}
*/
queue.runQueue('scenariosQueue', 1, processScenarios);

