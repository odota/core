/**
 * Methods for search functionality
 * */
const async = require('async');
const db = require('./db');
/**
 * @param db - database object
 * @param search - object for where parameter of query
 * @param cb - callback
 */
function findPlayer(search, cb) {
  db.first(['account_id', 'personaname', 'avatarfull']).from('players').where(search).asCallback(cb);
}

function search(options, cb) {
  const query = options.q;
  async.parallel({
    account_id(callback) {
      if (Number.isNaN(Number(query))) {
        return callback();
      }
      return findPlayer({
        account_id: Number(query),
      }, callback);
    },
    personaname(callback) {
      db.raw(`
        SELECT * FROM 
        (SELECT account_id, avatarfull, personaname, last_match_time, similarity(personaname, ?) AS similarity
        FROM players 
        WHERE personaname % ? 
        AND similarity(personaname, ?) >= ?
        ORDER BY last_match_time DESC
        LIMIT 250) search 
        ORDER BY similarity DESC, last_match_time DESC NULLS LAST;
        `, [query, query, query, options.similarity || 0.51]).asCallback((err, result) => {
        if (err) {
          return callback(err);
        }
        return callback(err, result.rows);
      });
    },
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    let ret = [];
    Object.keys(result).forEach((key) => {
      if (result[key]) {
        ret = ret.concat(result[key]);
      }
    });
    return cb(null, ret);
  });
}
module.exports = search;
