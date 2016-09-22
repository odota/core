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
const api_keys = config.STEAM_API_KEY.split(',');
const api_hosts = config.STEAM_API_HOST.split(',');
const parallelism = Math.min(api_hosts.length * 1, api_keys.length);
const delay = 1000;
start();

function start(err)
{
  if (err)
  {
    throw err;
  }
  redis.zrange('tracked', 0, -1, (err, ids) => {
    if (err)
    {
      throw err;
    }
    async.eachLimit(ids, parallelism, processPlayer, start);
  });
}

function processPlayer(account_id, cb)
{
  const ajob = generateJob('api_history',
    {
      account_id,
    });
  getData(
    {
      url: ajob.url,
      delay,
    }, (err, body) => {
    if (err)
    {
      console.error(err);
    }
    if (!body || !body.result || !body.result.matches)
    {
      // Skip this player on this iteration
      return cb();
    }
    redis.get('match_seq_num', (err, res) => {
      if (err)
      {
        console.error(err);
      }
      // Get matches with recent seqnums
      const matches = body.result.matches.filter((m) => {
        return m.match_seq_num > Number(res);
      }).map((m) => {
        return m.match_id;
      });
      async.eachLimit(matches, 1, processMatch, cb);
    });
  });
}

function processMatch(match_id, cb)
{
  // Check if exists
  redis.get('scanner_insert:' + match_id, (err, res) => {
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
      const job = generateJob('api_details',
        {
          match_id,
        });
      const url = job.url;
      getData(
        {
          url,
          delay,
        }, (err, body) => {
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
          const match = body.result;
          insertMatch(db, redis, match,
            {
              type: 'api',
              origin: 'scanner',
              skipCounts: false,
              skipAbilityUpgrades: false,
              cassandra,
            }, (err) => {
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
