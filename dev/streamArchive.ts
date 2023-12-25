import QueryStream from 'pg-query-stream';
import { Client } from 'pg';
import config from '../config';
import {
  doArchiveFromLegacy,
} from '../store/getArchivedData';

async function start() {
  const query = new QueryStream('SELECT match_id from parsed_matches WHERE is_archived IS NULL and match_id < 7500000000 ORDER BY match_id asc', []);
  const pg = new Client(config.POSTGRES_URL);
  await pg.connect();
  const stream = pg.query(query);
  let i = 0;
  stream.on('readable', async () => {
    let row;
    while ((row = stream.read())) {
      i += 1;
      console.log(i);
      try {
      await doArchiveFromLegacy(row.match_id.toString());
      } catch (e) {
        console.error(e);
      }
    }
  });
}

async function start2() {
  const start = Number(process.argv[2]) || 0;
  for (let i = start; i < 7500000000; i++) {
    console.log(i);
    try {
      await doArchiveFromLegacy(i);
    }
    catch (e) {
      console.error(e);
    }
  }
}
start2();