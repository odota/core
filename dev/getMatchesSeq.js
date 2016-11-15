/**
 * Load a range of matches by match_seq_num from the Steam API, without replay parsing
 **/
const async = require('async');
const utility = require('../util/utility');
const redis = require('../store/redis');
const queries = require('../store/queries');
const cluster = require('cluster');

const generateJob = utility.generateJob;
const getData = utility.getData;
const insertMatch = queries.insertMatch;
const args = process.argv.slice(2);
const startSeqNum = Number(args[0]) || 0;
const endSeqNum = Number(args[1]) || 0;
const delay = Number(args[2]) || 1000;
const bucketSize = 100000000;
// match seq num 59622 has a 32-bit unsigned int max (4294967295) in tower damage
// match seq num 239190 for hero_healing
// match seq num 542284 for hero_healing
// may need to cap values down to 2.1b if we encounter them
// postgres int type only supports up to 2.1b (signed int)
// bucket idspace into groups of 100000000
// save progress to redis key complete_history:n

function getPage(matchSeqNum, bucket) {
  if (matchSeqNum > bucket + bucketSize || matchSeqNum > endSeqNum) {
    process.exit(0);
  }
  const job = generateJob('api_sequence', {
    start_at_match_seq_num: matchSeqNum,
  });
  const url = job.url;
  getData({
    url,
    delay,
  }, (err, body) => {
    if (err) {
      throw err;
    }
    if (body.result) {
      const matches = body.result.matches;
      async.each(matches, (match, cb) => {
        insertMatch(match, {
          skipCounts: true,
          skipAbilityUpgrades: true,
          skipParse: true,
        }, cb);
      }, (err) => {
        if (err) {
          throw err;
        }
        const nextSeqNum = matches[matches.length - 1].match_seq_num + 1;
        redis.set(`complete_history:${bucket}`, nextSeqNum);
        return getPage(nextSeqNum, bucket);
      });
    } else {
      throw body;
    }
  });
}

if (cluster.isMaster) {
  // Fork workers.
  for (let i = startSeqNum; i < endSeqNum; i += bucketSize) {
    cluster.fork({
      BUCKET: i,
    });
  }
  cluster.on('exit', (worker, code) => {
    if (code !== 0) {
      throw new Error('worker died');
    }
    console.log('worker exited successfully');
  });
} else {
  const bucket = Number(process.env.BUCKET);
  redis.get(`complete_history:${bucket}`, (err, result) => {
    if (err) {
      throw err;
    }
    result = result ? Number(result) : bucket;
    getPage(result, bucket);
  });
}
