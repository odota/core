import async from 'async';
import db from './db.mts';
/**
 * @param search - object for where parameter of query
 * @param cb - callback
 */
function findPlayer(
  search: { account_id: string | number },
  cb: NonUnknownErrorCb
) {
  db.first(['account_id', 'personaname', 'avatarfull'])
    .from('players')
    .where(search)
    .asCallback(cb);
}
function search(options: { q: string }, cb: ErrorCb) {
  const query = options.q;
  async.parallel(
    {
      account_id: (cb) => {
        if (Number.isNaN(Number(query))) {
          return cb();
        }
        return findPlayer(
          {
            account_id: Number(query),
          },
          cb
        );
      },
      personaname: (cb) => {
        db.raw(
          `
        SELECT * FROM 
        (SELECT account_id, avatarfull, personaname, last_match_time
        FROM players 
        WHERE personaname ILIKE ?
        LIMIT 100) search
        ORDER BY last_match_time DESC NULLS LAST;
        `,
          [`%${query}%`]
        ).asCallback((err: Error | null, result: { rows: any[] }) => {
          if (err) {
            return cb(err);
          }
          return cb(err, result.rows);
        });
      },
    },
    (err: Error | null | undefined, result: any) => {
      if (err) {
        return cb(err);
      }
      let ret: any[] = [];
      Object.keys(result).forEach((key) => {
        if (result[key]) {
          ret = ret.concat(result[key]);
        }
      });
      return cb(null, ret);
    }
  );
}
export default search;
