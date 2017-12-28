const queue = require('../store/queue');
const buildMatch = require('../store/buildMatch');


function processScenarios(matchID, cb) {

    function buildScenario(scenario, matchID) {
        buildMatch(matchID, (err, match) => {
            if (err) {
                console.log("some error")
            }
            scenario(match)
        });
    }
    buildScenario(test, matchID);
}

function test(match) {
    console.log(match.match_id)
}


/*
scenarioChecks = [

  function firstBlood(match, row) {
    console.log(match.match_id);
    let team;
    let won;
    const fb = match.find((x) => {
      x.type === 'CHAT_MESSAGE_FIRSTBLOOD';
    });
    if (fb) {
      team = fb.key === 2 ? 1 : 0;
    }
    won = match.radiant_win === team;
  },

];
*/

queue.runQueue('scenariosQueue', 1, processScenarios);

