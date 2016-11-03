/**
 * Worker that parses replays
 * The actual parsing is done by invoking the Java-based parser.
 * The resulting event stream (newline-delimited JSON) is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 **/
const utility = require('../util/utility');
const getGcData = require('../util/getGcData');
const config = require('../config');
const db = require('../store/db');
const redis = require('../store/redis');
const queue = require('../store/queue');
const queries = require('../store/queries');
const compute = require('../util/compute');
const processAllPlayers = require('../processors/processAllPlayers');
const processTeamfights = require('../processors/processTeamfights');
const processLogParse = require('../processors/processLogParse');
const processUploadProps = require('../processors/processUploadProps');
const processParsedData = require('../processors/processParsedData');
const processMetadata = require('../processors/processMetadata');
const processExpand = require('../processors/processExpand');
const request = require('request');
const cp = require('child_process');
const progress = require('request-progress');
const stream = require('stream');
const pQueue = queue.getQueue('parse');
const async = require('async');
const readline = require('readline');
const spawn = cp.spawn;
const insertMatch = queries.insertMatch;
const getMatchBenchmarks = queries.getMatchBenchmarks;
const computeMatchData = compute.computeMatchData;
const buildReplayUrl = utility.buildReplayUrl;
// EXPRESS, use express to provide an HTTP interface to replay blobs uploaded to Redis.
const express = require('express');
const app = express();
app.get('/redis/:key', (req, res, cb) => {
  redis.get(new Buffer(`upload_blob:${req.params.key}`), (err, result) => {
    if (err) {
      return cb(err);
    }
    res.send(result);
  });
});
app.listen(config.PARSER_PORT);
// END EXPRESS
pQueue.process(config.PARSER_PARALLELISM, (job, cb) => {
  console.log('parse job: %s', job.jobId);
  const match = job.data.payload;
  async.series({
    getDataSource(cb) {
      if (match.replay_blob_key) {
        match.url = `http://localhost:${config.PARSER_PORT}/redis/${match.replay_blob_key}`;
        cb();
      } else {
        getGcData(db, redis, match, (err, result) => {
          if (err) {
            return cb(err);
          }
          match.url = buildReplayUrl(result.match_id, result.cluster, result.replay_salt);
          return cb(err);
        });
      }
    },
    runParse(cb) {
      runParse(match, job, cb);
    },
  }, (err) => {
    if (err) {
      console.error(err.stack || err);
    }
    return cb(err, match.match_id);
  });
});
pQueue.on('completed', (job) => {
  // Delay the removal so that the request polling has a chance to check for completion.
  // If interrupted, the regular cleanup process in worker will take care of orphaned jobs.
  setTimeout(() => {
    job.remove();
  }, 60 * 1000);
});

function insertUploadedParse(match, cb) {
  console.log('saving uploaded parse');
  // save uploaded replay parse in redis as a cached match
  match.match_id = match.upload.match_id;
  match.game_mode = match.upload.game_mode;
  match.radiant_win = match.upload.radiant_win;
  match.duration = match.upload.duration;
  match.players.forEach((p, i) => {
    utility.mergeObjects(p, match.upload.player_map[p.player_slot]);
    p.gold_per_min = ~~(p.gold / match.duration * 60);
    p.xp_per_min = ~~(p.xp / match.duration * 60);
    p.duration = match.duration;
    computeMatchData(p);
  });
  computeMatchData(match);
  getMatchBenchmarks(redis, match, (err) => {
    if (err) {
      return cb(err);
    }
    redis.setex(`match:${match.replay_blob_key}`, 60 * 60 * 24 * 7, JSON.stringify(match), cb);
  });
}

function insertStandardParse(match, cb) {
  // fs.writeFileSync('output.json', JSON.stringify(match));
  insertMatch(match, {
    type: 'parsed',
    skipParse: true,
    doLogParse: match.doLogParse,
  }, cb);
}

function runParse(match, job, cb) {
  // Parse state
  // Array buffer to store the events
  const entries = [];
  let incomplete = 'incomplete';
  let exited = false;
  const timeout = setTimeout(() => {
    download.abort();
    exit('timeout');
  }, 120000);
  const url = match.url;
  // Streams
  let download = request({
    url,
    encoding: null,
  });
  const inStream = progress(download);
  inStream.on('progress', (state) => {
    console.log(JSON.stringify({
      url,
      state,
    }));
    if (job) {
      job.progress(state.percentage * 100);
    }
  }).on('response', (response) => {
    if (response.statusCode !== 200) {
      exit(String(response.statusCode));
    }
  }).on('error', exit);
  let bz;
  if (url && url.slice(-3) === 'bz2') {
    bz = spawn('bunzip2');
  } else {
    const str = stream.PassThrough();
    bz = {
      stdin: str,
      stdout: str,
    };
  }
  bz.stdin.on('error', exit);
  bz.stdout.on('error', exit);
  inStream.pipe(bz.stdin);
  const parser = request.post(config.PARSER_HOST).on('error', exit);
  bz.stdout.pipe(parser);
  const parseStream = readline.createInterface({
    input: parser,
  });
  parseStream.on('line', (e) => {
    try {
      e = JSON.parse(e);
      if (e.type === 'epilogue') {
        console.log('received epilogue');
        incomplete = false;
        parseStream.close();
        exit();
      }
      entries.push(e);
    } catch (err) {
      exit(err);
    }
  });
  // request.debug = true;
  function exit(err) {
    if (exited) {
      return;
    }
    exited = true;
    err = err || incomplete;
    clearTimeout(timeout);
    if (err) {
      return cb(err);
    } else {
      const parsed_data = createParsedDataBlob(entries, match);
      if (match.replay_blob_key) {
        insertUploadedParse(parsed_data, cb);
      } else {
        insertStandardParse(parsed_data, cb);
      }
    }
  }
}

function createParsedDataBlob(entries, match) {
  console.time('processMetadata');
  const meta = processMetadata(entries);
  meta.match_id = match.match_id;
  console.timeEnd('processMetadata');
  console.time('adjustTime');
  // adjust time by zero value to get actual game time
  const adjustedEntries = entries.map(e => Object.assign({}, e, {
    time: e.time - meta.game_zero,
  }));
  console.timeEnd('adjustTime');
  console.time('processExpand');
  console.time('copyEntries');
  // make a copy of the array since processExpand mutates the type property of entries
  const adjustedEntriesCopy = JSON.parse(JSON.stringify(adjustedEntries));
  console.timeEnd('copyEntries');
  // TODO this should not mutate the original array
  const expanded = processExpand(adjustedEntriesCopy, meta);
  console.timeEnd('processExpand');
  console.time('processParsedData');
  const parsed_data = processParsedData(expanded.parsed_data, getParseSchema());
  console.timeEnd('processParsedData');
  console.time('processTeamfights');
  // TODO Teamfights processor should handle the original types (when processExpand no longer mutates state)
  const teamfights = processTeamfights(expanded.tf_data, meta);
  parsed_data.teamfights = teamfights;
  console.timeEnd('processTeamfights');
  console.time('processAllPlayers');
  const ap = processAllPlayers(expanded.int_data);
  parsed_data.radiant_gold_adv = ap.radiant_gold_adv;
  parsed_data.radiant_xp_adv = ap.radiant_xp_adv;
  console.timeEnd('processAllPlayers');
  if (match.replay_blob_key) {
    console.time('processUploadProps');
    const upload = processUploadProps(expanded.uploadProps, meta);
    parsed_data.upload = upload;
    console.timeEnd('processUploadProps');
  }
  if (match.doLogParse) {
    console.time('processLogParse');
    const logs = processLogParse(adjustedEntries, meta);
    parsed_data.logs = logs;
    console.timeEnd('processLogParse');
  }
  return Object.assign({}, parsed_data, match);
}

function getParseSchema() {
  return {
    version: 17,
    match_id: 0,
    teamfights: [],
    objectives: [],
    chat: [],
    radiant_gold_adv: [],
    radiant_xp_adv: [],
    cosmetics: {},
    players: Array(...new Array(10)).map(() => {
      return {
        player_slot: 0,
        obs_placed: 0,
        sen_placed: 0,
        creeps_stacked: 0,
        camps_stacked: 0,
        rune_pickups: 0,
        stuns: 0,
        max_hero_hit: {
          value: 0,
        },
        times: [],
        gold_t: [],
        lh_t: [],
        dn_t: [],
        xp_t: [],
        obs_log: [],
        sen_log: [],
        obs_left_log: [],
        sen_left_log: [],
        purchase_log: [],
        kills_log: [],
        buyback_log: [],
        // "pos": {},
        lane_pos: {},
        obs: {},
        sen: {},
        actions: {},
        pings: {},
        purchase: {},
        gold_reasons: {},
        xp_reasons: {},
        killed: {},
        item_uses: {},
        ability_uses: {},
        hero_hits: {},
        damage: {},
        damage_taken: {},
        damage_inflictor: {},
        runes: {},
        killed_by: {},
        kill_streaks: {},
        multi_kills: {},
        life_state: {},
        healing: {},
        damage_inflictor_received: {},
      };
    }),
  };
}
