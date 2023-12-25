import cassandra from '../store/cassandra';
import db from '../store/db';
import {
  deleteFromLegacy,
  doArchiveFromLegacy,
} from '../store/getArchivedData';

const stream = db
  .raw('SELECT match_id from parsed_matches WHERE is_archived IS NULL')
  .stream();
stream.on('readable', async () => {
  let row;
  while ((row = stream.read())) {
    // console.log(row);
    await doArchiveFromLegacy(row.match_id.toString());
  }
});

let i = 0;
// const stream = cassandra
//   .stream('select match_id, version from matches', [], {
//     prepare: true,
//     autoPage: true,
//     fetchSize: 1,
//   }).on('readable', async function () {
//     let row;
//     //@ts-ignore
//     while ((row = this.read())) {
//       i += 1;
//       console.log(i, Number(row.match_id));
//       if (row.version) {
//         await db.raw(
//           'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
//           [Number(row.match_id)]
//         );
//         await doArchiveFromLegacy(Number(row.match_id));
//       } else {
//         await deleteFromLegacy(Number(row.match_id));
//       }
//     }
//   });
stream.on('end', function () {
  // emitted when all rows have been retrieved and read
  console.log('finished');
  process.exit(0);
});
stream.on('error', function (e) {
  console.error(e);
  process.exit(1);
});
