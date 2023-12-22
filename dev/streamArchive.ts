import cassandra from '../store/cassandra';
import db from '../store/db';
import { doArchiveFromLegacy } from '../store/queries';

const stream = db.raw('SELECT match_id from parsed_matches WHERE is_archived IS NULL').stream();
stream.on('data', async (row) => {
  await doArchiveFromLegacy(row.match_id.toString());
  // console.log(row);
});

let i = 0;
// const stream = cassandra
//   .stream('select match_id, version from matches', [], {
//     prepare: true,
//     autoPage: true,
//   })
//   .on('readable', async function () {
//     // readable is emitted as soon a row is received and parsed
//     let row;
//     //@ts-ignore
//     while ((row = this.read())) {
//       // process row
//       i += 1;
//       console.log(i, row.match_id);
//       if (row.version) {
//         await db.raw(
//           'INSERT INTO parsed_matches(match_id) VALUES(?) ON CONFLICT DO NOTHING',
//           [row.match_id]
//         );
//         await doArchiveFromLegacy(row.match_id.toString());
//       } else {
//         await deleteFromStore(row.match_id.toString());
//       }
//     }
//   });
stream.on('end', function () {
  // emitted when all rows have been retrieved and read
  console.log('finished');
  // process.exit(0);
})
stream.on('error', function (e) {
  console.error(e);
  // process.exit(1);
});

async function deleteFromStore(id: string) {
  await Promise.all([
    cassandra.execute('DELETE from player_matches where match_id = ?', [id], {
      prepare: true,
    }),
    cassandra.execute('DELETE from matches where match_id = ?', [id], {
      prepare: true,
    }),
  ]);
}