import pg from 'pg';
import knex from 'knex';
import config from '../../config.ts';
import { convert64to32, getAnonymousAccountId } from '../util/utility.ts';
import util from 'node:util';

// remember: all values returned from the server are either NULL or a string
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));
console.log(
  '[POSTGRES] connecting %s with %s max connections',
  config.POSTGRES_URL,
  config.POSTGRES_MAX_CONNECTIONS,
);

export const db = knex({
  client: 'pg',
  connection: config.POSTGRES_URL,
  pool: {
    min: 0,
    max: Number(config.POSTGRES_MAX_CONNECTIONS),
    // afterCreate: (conn, done) => {
    //   // Set the minimum similarity for pg_trgm
    //   conn.query('SELECT set_limit(0.6);', (err) => {
    //     // if err is not falsy, connection is discarded from pool
    //     done(err, conn);
    //   });
    // },
  },
});

const columns: Record<string, any> = {};

export async function upsert(
  db: Knex,
  table: string,
  insert: AnyDict,
  conflict: NumberDict,
) {
  if (!columns[table]) {
    const result = await db(table).columnInfo();
    columns[table] = result;
  }
  const tableColumns = columns[table];
  const row = { ...insert };
  // Remove extra properties
  Object.keys(row).forEach((key) => {
    if (!tableColumns[key]) {
      delete row[key];
    }
  });
  const values = Object.keys(row).map(() => '?');
  const update = Object.keys(row).map((key) =>
    util.format('%s=%s', key, `EXCLUDED.${key}`),
  );
  const query = util.format(
    'INSERT INTO %s (%s) VALUES (%s) ON CONFLICT (%s) DO UPDATE SET %s',
    table,
    Object.keys(row).join(','),
    values.join(','),
    Object.keys(conflict).join(','),
    update.join(','),
  );
  return db.raw(
    query,
    Object.keys(row).map((key) => row[key]),
  );
}

export async function upsertPlayer(db: Knex, player: Partial<User>) {
  if (player.steamid) {
    // convert steamid to accountid
    player.account_id = Number(convert64to32(player.steamid));
  }
  if (!player.account_id || player.account_id === getAnonymousAccountId()) {
    return;
  }
  return upsert(db, 'players', player, {
    account_id: player.account_id,
  });
}

export default db;
