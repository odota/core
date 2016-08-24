/**
 * Methods for search functionality
 **/
const async = require('async');
/**
 * @param db - database object
 * @param search - object for where parameter of query
 * @param cb - callback
 */
function findPlayer(db, search, cb)
{
  db.first(['account_id', 'personaname', 'avatarfull']).from('players').where(search).asCallback(cb);
}

function search(db, query, cb)
{
  async.parallel(
  {
    account_id: function (callback)
    {
      if (Number.isNaN(Number(query)))
      {
        return callback();
      }
      else
      {
        findPlayer(db,
        {
          account_id: Number(query)
        }, callback);
      }
    },
    personaname: function (callback)
    {
      db.raw(`
                    SELECT * FROM 
                    (SELECT account_id, avatarfull, personaname, similarity(personaname, ?) AS sml 
                    FROM players 
                    WHERE personaname % ? 
                    LIMIT 500) search 
                    ORDER BY sml DESC;
                    `, [query, query]).asCallback(function (err, result)
      {
        if (err)
        {
          return callback(err);
        }
        return callback(err, result.rows);
      });
    }
  }, function (err, result)
  {
    if (err)
    {
      return cb(err);
    }
    var ret = [];
    for (var key in result)
    {
      if (result[key])
      {
        ret = ret.concat(result[key]);
      }
    }
    cb(null, ret);
  });
}
module.exports = search;
