const queue = require('../store/queue');
const buildMatch = require('../store/buildMatch');
const db = require('../store/db');

function processScenarios(matchID, cb) {
  buildMatch(matchID, (err, match) => {
    if (err) {
      cb(err)
    }
    console.log(match.match_id);

    if (scenarioChecks[0](match).condition) {
      const name = scenarioChecks[0](match).name
      const incrementWins = scenarioChecks[0](match).won ? 1 : 0

    db.raw(`INSERT INTO team_scenarios VALUES (?, ?, ?) ON CONFLICT(scenario) DO UPDATE SET wins = team_scenarios.wins + ${incrementWins}, games = team_scenarios.games + 1`, [name, 1, 1]).asCallback(cb);
    }
    console.log("test");
  });
}

var scenarioChecks = [
  function firstBlood(match) {
    let team;
    let won;
    console.log(typeof match)
    const condition = match.objectives.find(function(x){return x.type === 'CHAT_MESSAGE_FIRSTBLOOD'});
    if (condition) {
      team = condition.player_slot < 5 ? true : false;
    }
    console.log(team)
    won = match.radiant_win === team;
    console.log(won)
    return {
      name: "First Blood",
      condition,
      won,
    }
  },

];

/*
function scenarioChecks()  {

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

