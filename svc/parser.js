/**
 * Worker that parses replays
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
const cp = require('child_process');
const async = require('async');
const numCPUs = require('os').cpus().length;
const express = require('express');
const utility = require('../util/utility');
const getGcData = require('../util/getGcData');
const config = require('../config');
const queue = require('../store/queue');
const queries = require('../store/queries');
const fs = require('fs');
const { json } = require('body-parser');

const { insertMatch } = queries;
const { buildReplayUrl } = utility;

const app = express();
app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.listen(config.PORT || config.PARSER_PORT);

function runParse(match, job, cb) {
  let { url } = match;
  console.log(match)
  console.log('uuuuuuuuuuuuu',url)
  if (config.NODE_ENV === 'test') {
    url = `https://odota.github.io/testfiles/${match.match_id}_1.dem`;
    // url = `replay133.valve.net/570/5636217501_1032939160.dem.bz2`;
  }
  let container_ip = '172.17.0.1:5700'
  console.log('runparser',new Date(), url);
  console.log(`curl --max-time 180 --fail ${url} | ${url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'} | curl -X POST -T - 172.:5600 |
   node processors/createParsedDataBlob.js ${match.match_id} ${Boolean(match.doLogParse)}`)
  cp.exec(
    `curl --max-time 180 --fail ${url} | ${url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'} | curl -X POST -T - ${config.PARSER_HOST} | node processors/createParsedDataBlob.js ${match.match_id} ${Boolean(match.doLogParse)}`,
    { shell: true, maxBuffer: 10 * 1024 * 1024 },
    (err, stdout) => {
      if (err) {
        return cb(err);
      }
      fs.writeFileSync("z_output/out.txt", stdout, "utf8", (err) => {
        if (err) console.log(err);
        console.log("saved");
      });
      // console.log(typeof(result),typeof(JSON.stringify(result,null,2)));
      const result = Object.assign({}, JSON.parse(stdout), match);
      fs.writeFileSync("z_output/parsed.json", JSON.stringify(result,null,2), "utf8", (err) => {
        if (err) console.log(err);
        console.log("saved");
      });
      return insertMatch(result, {
        type: 'parsed',
        skipParse: true,
        doLogParse: match.doLogParse,
        doScenarios: match.origin === 'scanner' && match.match_id % 100 < config.SCENARIOS_SAMPLE_PERCENT,
        doParsedBenchmarks: match.origin === 'scanner' && match.match_id % 100 < config.BENCHMARKS_SAMPLE_PERCENT,
        doTellFeed: match.origin === 'scanner',
      }, cb);
    },
  );
}

function parseProcessor(job, cb) {
  const match = job;
  console.log('parseprocessor',match)
  async.series({
    getDataSource(cb) {
      getGcData(match, (err, result) => {
        if (err) {
          return cb(err);
        }
        match.url = buildReplayUrl(result.match_id, result.cluster, result.replay_salt);
        return cb(err);
      });
    },
    runParse(cb) {
      runParse(match, job, cb);
    },
  }, (err) => {
    if (err) {
      console.error(err.stack || err);
    } else {
      console.log('completed parse of match %s', match.match_id);
    }
    return cb(err, match.match_id);
  });
}

queue.runReliableQueue('parse', Number(config.PARSER_PARALLELISM) || numCPUs, parseProcessor);
