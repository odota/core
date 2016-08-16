const async = require('async');
const utility = require('../util/utility');
const generateJob = utility.generateJob;
const getData = utility.getData;
const redis = require('../store/redis');
const db = require('../store/db');
const cassandra = require('../store/cassandra');
const queries = require('../store/queries');
const insertMatch = queries.insertMatch;
const config = require('../config');
const PARALLELISM = config.STEAM_API_HOST.split(',').length * 8;
const delay = 1000;
start();

function start(err)
{
  if (err)
  {
    throw err;
  }
  queries.getSets(redis, function (err, result)
  {
    if (err)
    {
      throw err;
    }
    async.eachLimit(Object.keys(result.trackedPlayers), PARALLELISM, processPlayer, start);
  });
}

function processPlayer(account_id, cb)
{
  var ajob = generateJob('api_history',
  {
    account_id: account_id
  });
  getData(
  {
    url: ajob.url,
    delay: delay
  }, function (err, body)
  {
    if (err)
    {
      console.error(err);
    }
    if (!body || !body.result || !body.result.matches)
    {
      // Skip this player on this iteration
      return cb();
    }
    redis.get('match_seq_num', function (err, res)
    {
      if (err)
      {
        console.error(err);
      }
      // Get matches with recent seqnums
      var matches = body.result.matches.filter(function (m)
      {
        return m.match_seq_num > Number(res);
      }).map(function (m)
      {
        return m.match_id;
      });
      async.eachLimit(matches, 1, processMatch, cb);
    });
  });
}

function processMatch(match_id, cb)
{
  // Check if exists
  redis.get('scanner_insert:' + match_id, function (err, res)
  {
    if (err)
    {
      return cb(err);
    }
    if (res)
    {
      return cb();
    }
    else
    {
      var job = generateJob("api_details",
      {
        match_id: match_id
      });
      var url = job.url;
      getData(
      {
        url: url,
        delay: delay
      }, function (err, body)
      {
        if (err)
        {
          throw err;
        }
        if (!body.result)
        {
          return cb();
        }
        else
        {
          var match = body.result;
          insertMatch(db, redis, match,
          {
            type: "api",
            origin: "scanner",
            skipCounts: false,
            skipAbilityUpgrades: false,
            skipParse: false,
            cassandra: cassandra,
          }, function (err)
          {
            if (!err)
            {
              redis.set('scanner_insert:' + match.match_id, 1);
            }
            cb(err);
          });
        }
      });
    }
  });
}
