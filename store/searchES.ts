import async from 'async';
import db from './db';
import { es, INDEX } from './elasticsearch';
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
              return cb(err);
            }
            return cb(
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
