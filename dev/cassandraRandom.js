const cassandra = require("../store/cassandra");
const db = require("../store/db");

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let total = 0;
let haveRows = 0;

async function start() {
  // Get the current max_match_id from postgres, subtract 200000000
  let max = (await db.raw(`select max(match_id) from public_matches`))
    ?.rows?.[0]?.max;
  let limit = max - 200000000;
  while (true) {
    // Test a random match ID
    const rand = randomInteger(1, limit);

    let result = await cassandra.execute(
      `select match_id, player_slot, stuns from player_matches where match_id = ?`,
      [rand.toString()],
      {
        prepare: true,
        fetchSize: 10,
        autoPage: true,
      }
    );
    total += 1;
    // Check if there are rows
    if (result.rows.length) {
      haveRows += 1;
      console.log(result.rows[0].match_id.toString(), "has rows");
    }
    if (total % 100 === 0) {
      // Log number that have rows/don't have rows
      console.log(haveRows, "/", total, "have rows");
    }
  }
}

start();
