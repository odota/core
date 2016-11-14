/**
 * Methods for search functionality
 **/
const async = require('async');
/**
 * @param db - database object
 * @param search - object for where parameter of query
 * @param cb - callback
 */
function findPlayer(db, search, cb) {
  db.first(['account_id', 'personaname', 'avatarfull']).from('players').where(search).asCallback(cb);
}

function search(db, query, cb) {
  async.parallel({
    account_id(callback) {
      if (isNaN(Number(query))) {
        return callback();
      }
      return findPlayer(db, {
        account_id: Number(query),
      }, callback);
    },
    personaname(callback) {
      db.raw(`
        SELECT * FROM 
        (SELECT account_id, avatarfull, personaname, similarity(personaname, ?) AS sml 
        FROM players 
        WHERE personaname % ? 
        AND similarity(personaname, ?) > 0.4
        LIMIT 500) search 
        ORDER BY sml DESC;
        `, [query, query, query]).asCallback((err, result) => {
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
