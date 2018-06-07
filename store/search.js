/**
 * Methods for search functionality
 * */
const async = require('async');
const db = require('./db');
const es = require('./elasticsearch');
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
      es.search({
        index: 'dota',
        body: {
          query: {
            match: {
              personaname: {
                query: query,
                fuzziness: 3,
                zero_terms_query: "all"
              }
            }
          },
        }
      }, (err, res) => {
        console.log('search');
        console.log(err, res);
        callback(err, res);
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
