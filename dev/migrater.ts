import config from "../config.ts";
import cassandra, { getCassandraColumns } from "../svc/store/cassandra.ts";
import redis from "../svc/store/redis.ts";

// const SCYLLA_URL = '';
// const scylla = new scyllaDriver.Client({
//   contactPoints: [url.parse(SCYLLA_URL, false).host ?? ''],
//   localDataCenter: 'datacenter1',
//   keyspace: 'yasp',
// });

const allFields = await getCassandraColumns("player_caches");
// Estimate--approximately 25 billion rows to migrate?
// Split the full token range so each chunk is reasonably sized (50k or so?)
while (true) {
  const tokenRangeSize =
    (BigInt(2 ** 64) / BigInt(25000000000)) * BigInt(50000);
  const begin = BigInt(
    (await redis.get("scyllaMigrateCheckpoint")) ?? "-9223372036854775808",
  );
  const end = begin + BigInt(tokenRangeSize);
  console.log(begin, end, tokenRangeSize);
  let count = 0;
  await new Promise((resolve) => {
    cassandra
      .stream(
        `select * from player_caches where token(account_id) >= ? and token(account_id) < ?`,
        [begin.toString(), end.toString()],
        {
          prepare: true,
          fetchSize: 1000,
          autoPage: true,
        },
      )
      .on("readable", function () {
        // readable is emitted as soon a row is received and parsed
        let row: any;
        //@ts-expect-error
        while ((row = this.read())) {
          // console.log(row.tkn.toString());
          // console.log(row);
          const serializedMatch: any = {};
          Object.keys(allFields).forEach((k) => {
            if (row[k] !== null) {
              serializedMatch[k] = row[k].toString();
            }
          });
          console.log(serializedMatch.account_id, serializedMatch.match_id);
          count += 1;
          // Copy from Cassandra to Scylla
          /*
              const query = util.format(
              'INSERT INTO player_caches (%s) VALUES (%s)',
              Object.keys(serializedMatch).join(','),
              Object.keys(serializedMatch)
                  .map(() => '?')
                  .join(','),
              );
              const arr = Object.keys(serializedMatch).map((k) => serializedMatch[k]);
              await scylla.execute(query, arr, {
              prepare: true,
              });
              */
        }
      })
      .on("end", resolve)
      .on("error", () => {
        throw new Error("error while reading");
      });
  });
  console.log("found %s matches in range", count);
  console.log(end);
  // Checkpoint progress to redis
  // await redis.set('scyllaMigrateCheckpoint', end.toString());
  // When we get to the end we should find no more rows and stop
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// Try out using COPY TO/COPY FROM (requires cqlsh)
// Figure out approx how many rows are in data set and partition the token range so each export is reasonable
// const result = await cassandra.execute(
//     `COPY player_caches TO STDOUT WITH BEGINTOKEN = ?`,
//     [begin.toString()],
//     {
//       prepare: true,
//     },
//   );
// console.log(result);
