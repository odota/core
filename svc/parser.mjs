/**
 * Worker that parses replays
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
import { exec } from 'child_process';
import os from 'os';
import express from 'express';
import utility from '../util/utility.js';
import getGcData from '../util/getGcData.js';
import config from '../config.js';
import { runReliableQueue } from '../store/queue.js';
import queries from '../store/queries.js';
import { promisify } from 'util';
const { PORT, PARSER_PORT, NODE_ENV, PARSER_HOST, PARSER_PARALLELISM } = config;
const numCPUs = os.cpus().length;
const { insertMatchPromise } = queries;
const { buildReplayUrl } = utility;
const execPromise = promisify(exec);
const app = express();
app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.listen(PORT || PARSER_PORT);
async function runParse(match, url) {
  if (NODE_ENV === 'test') {
    url = `https://odota.github.io/testfiles/${match.match_id}_1.dem`;
  }
  console.log(new Date(), url);
  const { stdout } = await execPromise(
    `curl --max-time 180 --fail ${url} | ${
      url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'
    } | curl -X POST -T - ${PARSER_HOST} | node processors/createParsedDataBlob.js ${
      match.match_id
    }`,
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
runReliableQueue(
  'parse',
  Number(PARSER_PARALLELISM) || numCPUs,
  parseProcessor
);
