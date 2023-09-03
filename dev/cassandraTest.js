const cassandra = require("../store/cassandra");

const myArgs = process.argv.slice(2);

// 5000000000
const test = async () => {
  let ok = 0;
  let noResult = 0;
  let error = 0;
  const query = "SELECT match_id FROM player_matches WHERE match_id = ?";
  const promises = [];

  for (let i = Number(myArgs[0]); i < Number(myArgs[1]); i+=1) {
    promises.push(
      cassandra.execute(query, [i], {
        prepare: true,
        fetchSize: 24,
        autoPage: true,
      })
      .then(result => {
        if (result.rows[0] != null) {
          return "ok";
        } 
          return "noResult";
        
      })
      .catch(e => {
        console.error(i);
        console.error(e.message);
        return "error";
      })
    );
  }

  const results = await Promise.all(promises);

  results.forEach(result => {
    if (result === "ok") {
      ok += 1;
    } else if (result === "noResult") {
      noResult += 1;
    } else if (result === "error") {
      error += 1;
    }
  });

  console.log("ok: %s, noResult: %s, error: %s", ok, noResult, error);
};

test();
