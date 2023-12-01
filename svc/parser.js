/**
 * Worker that parses replays
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
const { exec } = require('child_process');
const async = require('async');
const numCPUs = require('os').cpus().length;
const express = require('express');
const utility = require('../util/utility');
const getGcData = require('../util/getGcData');
const config = require('../config');
const queue = require('../store/queue');
const queries = require('../store/queries');
const { promisify } = require('util');

const { insertMatchPromise } = queries;
const { buildReplayUrl } = utility;
const execPromise = promisify(exec);

const app = express();
app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.listen(config.PORT || config.PARSER_PORT);

async function runParse(match, url) {
  if (config.NODE_ENV === 'test') {
    url = `https://odota.github.io/testfiles/${match.match_id}_1.dem`;
  }
  console.log(new Date(), url);
  const {stdout} = await execPromise(
    `curl --max-time 180 --fail ${url} | ${
      url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'
    } | curl -X POST -T - ${
      config.PARSER_HOST
    } | node processors/createParsedDataBlob.js ${match.match_id}`,
    { shell: true, maxBuffer: 10 * 1024 * 1024 }
  );
  const result = { ...JSON.parse(stdout), ...match };
  await insertMatchPromise(result, {
    type: 'parsed',
    skipParse: true,
  });
}

async function parseProcessor(job, cb) {
  const match = job;
  try {
    const result = await getGcData(match);
    const url = buildReplayUrl(
      result.match_id,
      result.cluster,
      result.replay_salt
    );
    await runParse(match, url);
    console.log('[PARSER] completed parse of match %s', match.match_id);
    cb(null, match.match_id);
  } catch (e) {
    cb(e);
  }
}

queue.runReliableQueue(
  'parse',
  Number(config.PARSER_PARALLELISM) || numCPUs,
  parseProcessor
);
