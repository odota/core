const cassandra = require('../store/cassandra');
const db = require('../store/db');

async function start() {
    // Get the current max_match_id from postgres, subtract 200000000
    let max = (await db.raw(`select max(match_id) from public_matches`))?.rows?.[0]?.max;
    let limit = max - 200000000;
    while(true) {
        try {
        let threshold = Math.floor(Math.random() * limit);
        console.log(threshold);
        const array = [];
        for (let i = 0; i < 100; i++) {
            array.push(threshold + i);
        }
        // Find 100 IDs to delete
        let result = await cassandra.execute(`select match_id,version from matches where match_id IN (${array.map(id => '?').join(',')})`, array, {
            prepare: true,
            fetchSize: 100,
            autoPage: true,
          });

        // Put the ones that don't have stuns data into an array
        let ids = result.rows.filter(result => result.version == null).map(result => result.match_id);
        console.log(ids.length, 'out of', result.rows.length, 'to delete');

        for (let i = 0; i < ids.length; i++) {
            // Delete those rows from player_matches
            let del = await cassandra.execute(`DELETE from player_matches where match_id = ?`, [ids[i]], {
                prepare: true,
                fetchSize: 100,
                autoPage: true,
            });
        }
    } catch(e) {
        console.log(e);
    }
    }

}

start();