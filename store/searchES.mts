import async from 'async';
import db from './db.mjs';
import { es, INDEX } from './elasticsearch.mts';
/**
 * @param search - object for where parameter of query
 * @param cb - callback
 */
function findPlayer(search: { account_id: string | number }, cb: Function) {
  db.first(['account_id', 'personaname', 'avatarfull'])
    .from('players')
    .where(search)
    .asCallback(cb);
}
function search(options: { q: string }, cb: Function) {
  const query = options.q;
  async.parallel(
    {
      account_id: (callback: Function) => {
        if (Number.isNaN(Number(query))) {
          return callback();
        }
        return findPlayer(
          {
            account_id: Number(query),
          },
          callback
        );
      },
      personaname: (callback: Function) => {
        es.search(
          {
            index: INDEX,
            size: 50,
            body: {
              query: {
                match: {
                  personaname: {
                    query,
                  },
                },
              },
              sort: [{ _score: 'desc' }, { last_match_time: 'desc' }],
            },
          },
          (err, { body }) => {
            if (err) {
              return callback(err);
            }
            return callback(
              null,
              body.hits.hits.map((e: any) => ({
                account_id: Number(e._id),
                personaname: e._source.personaname,
                avatarfull: e._source.avatarfull,
                last_match_time: e._source.last_match_time,
                similarity: e._score,
              }))
            );
          }
        );
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
