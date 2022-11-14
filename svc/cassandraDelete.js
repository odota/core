const cassandra = require('../store/cassandra');
const db = require('../store/db');
const crypto = require('crypto');

function genRandomNumber(byteCount, radix) {
    return BigInt('0x' + crypto.randomBytes(byteCount).toString('hex')).toString(radix)
}

async function start() {
    // Get the current max_match_id from postgres, subtract 200000000
    let max = (await db.raw(`select max(match_id) from public_matches`))?.rows?.[0]?.max;
    let limit = max - 200000000;
    while(true) {
        try {
        // let threshold = Math.floor(Math.random() * limit);
        // console.log(threshold);
        // const array = [];
        // for (let i = 0; i < 100; i++) {
        //     array.push(threshold + i);
        // }
        // Find 100 IDs to delete
        // let result = await cassandra.execute(`select match_id,version from matches where match_id IN (${array.map(id => '?').join(',')})`, array, {
        //     prepare: true,
        //     fetchSize: 100,
        //     autoPage: true,
        //   });
        
        // Convert to signed bigint
        const randomBigint = BigInt.asIntN(64, genRandomNumber(8, 10));
        let result = await cassandra.execute(`select match_id, player_slot, stuns, token(match_id) from player_matches where token(match_id) >= ? and player_slot = 1 limit 300 ALLOW FILTERING;`, [randomBigint.toString()], {
            prepare: true,
            fetchSize: 300,
            autoPage: true,
          });
        
        // Put the ones that don't have parsed data into an array
        let ids = result.rows.filter(result => result.stuns == null && result.match_id < limit).map(result => result.match_id);
        console.log(ids.length, 'out of', result.rows.length, 'to delete, ex:', ids[0]?.toString());

        await Promise.all(ids.map(id => cassandra.execute(`DELETE from player_matches where match_id = ?`, [id], {
            prepare: true,
            fetchSize: 300,
            autoPage: true,
        })
        ));
    } catch(e) {
        console.log(e);
    }
    }

}

start();
