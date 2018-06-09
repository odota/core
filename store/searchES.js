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
                query,
              },
            },
          },
        },
      }, (err, res) => {
        if (err) {
          return callback(err);
        }
        // TODO: get lastmatch time or remove from UI
        return callback(null, res.hits.hits.map(e => ({
          account_id: e._id,
          personaname: e._source.personaname,
          avatarfull: e._source.avatarfull,
        })));
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
