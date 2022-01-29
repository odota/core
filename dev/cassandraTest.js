const cassandra = require('../store/cassandra');
const myArgs = process.argv.slice(2);

// 5000000000
const test = async () => {
    let ok = 0;
    let noResult = 0;
    let error = 0;
    const query = 'SELECT match_id FROM player_matches WHERE match_id = ?';
    for (let i = myArgs[0]; i < myArgs[1]; i++) {
        try {
        const result = await cassandra.execute(query, [ i.toString() ]);
        if (result.rows.length === 0) {
            ok += 1;
        } else {
            noResult += 1;
        }
        } catch (e) {
            console.error(i);
            console.error(e);
            error +=1;
            // Remediate by deleting and requesting
            // await cassandra.execute(`DELETE from player_matches where match_id = ?`, [ i.toString() ]);

        }
    }
    console.log('ok: %s, noResult: %s, error: %s', ok, noResult, error);
}

test();
