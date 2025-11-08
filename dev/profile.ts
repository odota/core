import db from '../svc/store/db.ts';
import QueryStream from 'pg-query-stream';
import { addJob } from '../svc/store/queue.ts';
import { Client } from 'pg';
import config from '../config.ts';

// const { rows } = await db.raw('select account_id from players where personaname is null');
// for (let i = 0; i < rows.length; i++) {
// await addJob({
//     name: 'profileQueue',
//     data: {
//         account_id: rows[i].account_id,
//     },
// });
// }

const query = new QueryStream(
  `
select account_id from players LEFT JOIN rank_tier using(account_id) where rating is null
`,
  [],
);
const pg = new Client(config.POSTGRES_URL);
await pg.connect();
const stream = pg.query(query);
let i = 0;
stream.on('readable', async () => {
  let row;
  while ((row = stream.read())) {
    await addJob({
      name: 'mmrQueue',
      data: {
        account_id: row.account_id,
      },
    });
  }
});
