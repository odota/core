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



queue.runQueue('scenariosQueue', 1, processScenarios);

