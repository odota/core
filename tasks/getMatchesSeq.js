const async = require('async');
const utility = require('../util/utility');
const generateJob = utility.generateJob;
const getData = utility.getData;
const db = require('../store/db');
const redis = require('../store/redis');
const cassandra = require('../store/cassandra');
const queries = require('../store/queries');
const insertMatch = queries.insertMatch;
const args = process.argv.slice(2);
const start_seq_num = Number(args[0]) || 0;
const end_seq_num = Number(args[1]) || 0;
const delay = Number(args[2]) || 1000;
const cluster = require('cluster');
// match seq num 59622 has a 32-bit unsigned int max (4294967295) in one of the players' tower damage
// match seq num 239190 for hero_healing
// match seq num 542284 for hero_healing
// may need to cap values down to 2.1b if we encounter them
// postgres int type only supports up to 2.1b (signed int)
// bucket idspace into groups of 100000000
// save progress to redis key complete_history:n
const bucket_size = 100000000;
if (cluster.isMaster)
{
    // Fork workers.
  for (let i = start_seq_num; i < end_seq_num; i += bucket_size)
    {
    cluster.fork(
      {
        BUCKET: i,
      });
  }
  cluster.on('exit', (worker, code, signal) =>
    {
    if (code !== 0)
        {
      throw 'worker died';
    }
    else
        {
      console.error('worker exited successfully');
    }
  });
}
else
{
  const bucket = Number(process.env.BUCKET);
  redis.get('complete_history:' + bucket, (err, result) => {
    if (err)
        {
      throw err;
    }
    result = result ? Number(result) : bucket;
    getPage(result, bucket);
  });
}

function getPage(match_seq_num, bucket)
{
  if (match_seq_num > bucket + bucket_size || match_seq_num > end_seq_num)
    {
    process.exit(0);
  }
  const job = generateJob('api_sequence',
    {
      start_at_match_seq_num: match_seq_num,
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
    if (body.result)
        {
      const matches = body.result.matches;
      async.each(matches, (match, cb) => {
        insertMatch(db, redis, match,
          {
            skipCounts: true,
            skipAbilityUpgrades: true,
            skipParse: true,
            cassandra,
          }, cb);
      }, (err) => {
        if (err)
                {
          throw err;
        }
        const next_seq_num = matches[matches.length - 1].match_seq_num + 1;
        redis.set('complete_history:' + bucket, next_seq_num);
        return getPage(next_seq_num, bucket);
      });
    }
    else
        {
      throw body;
    }
  });
}
