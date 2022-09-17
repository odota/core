const cassandra = require('../store/cassandra');
const db = require('../store/db');

async function start() {
    // Get the current max_match_id from postgres, subtract 200000000
    let max = (await db.raw(`select max(match_id) from public_matches`))?.rows?.[0]?.max;
    let limit = max - 200000000;
    console.log(limit);
    while(true) {
        // Find 100 IDs to delete
        let result = await cassandra.execute(`select match_id, stuns from player_matches where match_id < ? and player_slot = 0 limit 100 ALLOW FILTERING;`, [limit], {
            prepare: true,
            fetchSize: 100,
            autoPage: true,
          });

        // Put the ones that don't have stuns data into an array
        let ids = result.rows.filter(result => result.stuns == null).map(result => result.id);
        console.log(ids.length);

        // Delete those rows from player_matches
        let del = await cassandra.execute(`DELETE from player_matches where match_id IN(${ids.map(id => '?').join(',')})`, ids, {
            prepare: true,
            fetchSize: 100,
            autoPage: true,
          });
        console.log(del);
    }
}

start();