/**
 * Worker that parses replays
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 **/
const utility = require('../util/utility');
const getGcData = require('../util/getGcData');
const config = require('../config');
const queue = require('../store/queue');
const queries = require('../store/queries');
// const compute = require('../util/compute');
const processAllPlayers = require('../processors/processAllPlayers');
const processTeamfights = require('../processors/processTeamfights');
const processLogParse = require('../processors/processLogParse');
// const processUploadProps = require('../processors/processUploadProps');
const processParsedData = require('../processors/processParsedData');
const processMetadata = require('../processors/processMetadata');
const processExpand = require('../processors/processExpand');
const request = require('request');
const cp = require('child_process');
const progress = require('request-progress');
const stream = require('stream');
const async = require('async');
const readline = require('readline');

const spawn = cp.spawn;
const insertMatch = queries.insertMatch;
const buildReplayUrl = utility.buildReplayUrl;
// const getMatchBenchmarks = queries.getMatchBenchmarks;
// const computeMatchData = compute.computeMatchData;

/*
function insertUploadedParse(match, cb) {
  console.log('saving uploaded parse');
  // save uploaded replay parse in redis as a cached match
  match.match_id = match.upload.match_id;
  match.game_mode = match.upload.game_mode;
  match.radiant_win = match.upload.radiant_win;
  match.duration = match.upload.duration;
  match.players.forEach((p) => {
    utility.mergeObjects(p, match.upload.player_map[p.player_slot]);
    p.gold_per_min = Math.floor(p.gold / match.duration * 60);
    p.xp_per_min = Math.floor(p.xp / match.duration * 60);
    p.duration = match.duration;
    computeMatchData(p);
  });
  computeMatchData(match);
  getMatchBenchmarks(redis, match, (err) => {
    if (err) {
      return cb(err);
    }
    // Expire in a week
    const expire = 60 * 60 * 24 * 7;
    return redis.setex(`match:${match.replay_blob_key}`, expire, JSON.stringify(match), cb);
  });
}
*/

function insertStandardParse(match, cb) {
  // fs.writeFileSync('output.json', JSON.stringify(match));
  insertMatch(match, {
    type: 'parsed',
    skipParse: true,
    doLogParse: match.doLogParse,
  }, cb);
}

function getParseSchema() {
  return {
    version: 20,
    match_id: 0,
    teamfights: [],
    objectives: [],
    chat: [],
    radiant_gold_adv: [],
    radiant_xp_adv: [],
    cosmetics: {},
    players: Array(...new Array(10)).map(() =>
      ({
        player_slot: 0,
        obs_placed: 0,
        sen_placed: 0,
        creeps_stacked: 0,
        camps_stacked: 0,
        rune_pickups: 0,
        firstblood_claimed: 0,
        teamfight_participation: 0,
        towers_killed: 0,
        roshans_killed: 0,
        observers_placed: 0,
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
        runes_log: [],
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
        randomed: false,
        repicked: false,
        pred_vict: false,
      }),
    ),
  };
}

function createParsedDataBlob(entries, match) {
  console.time('processMetadata');
  const meta = processMetadata(entries);
  meta.match_id = match.match_id;
  meta.abilities = (match.ability_upgrades || []).map(e => Object.assign({}, e, {
    time: e.time - meta.game_zero,
  }));
  console.timeEnd('processMetadata');
  console.time('adjustTime');
  // adjust time by zero value to get actual game time
  const adjustedEntries = entries.map(e => Object.assign({}, e, {
    time: e.time - meta.game_zero,
  }));
  console.timeEnd('adjustTime');
  console.time('processExpand');
  const expanded = processExpand(adjustedEntries, meta);
  console.timeEnd('processExpand');
  console.time('processParsedData');
  const parsedData = processParsedData(expanded, getParseSchema(), meta);
  console.timeEnd('processParsedData');
  console.time('processTeamfights');
  parsedData.teamfights = processTeamfights(expanded, meta);
  console.timeEnd('processTeamfights');
  console.time('processAllPlayers');
  const ap = processAllPlayers(adjustedEntries, meta);
  parsedData.radiant_gold_adv = ap.radiant_gold_adv;
  parsedData.radiant_xp_adv = ap.radiant_xp_adv;
  console.timeEnd('processAllPlayers');
  if (match.doLogParse) {
    console.time('processLogParse');
    parsedData.logs = processLogParse(adjustedEntries, meta);
    console.timeEnd('processLogParse');
  }
  return Object.assign({}, parsedData, match);
}

function runParse(match, job, cb) {
  // Parse state
  // Array buffer to store the events
  const entries = [];
  const url = match.url;
  let incomplete = 'incomplete';
  let exited = false;
  const download = request({
    url,
    encoding: null,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.99 Safari/537.36',
    },
  });
  const timeout = setTimeout(() => {
    download.abort();
    /* eslint-disable no-use-before-define */
    exit('timeout');
    /* eslint-enable no-use-before-define */
  }, 120000);

  function exit(err) {
    if (exited) {
      return null;
    }
    exited = true;
    err = err || incomplete;
    clearTimeout(timeout);
    if (err) {
      return cb(err);
    }
    try {
      const parsedData = createParsedDataBlob(entries, match);
      return insertStandardParse(parsedData, cb);
    } catch (e) {
      return cb(e);
    }
  }

  // Streams
  const inStream = progress(download);
  inStream.on('progress', (state) => {
    console.log(JSON.stringify({
      url,
      state,
    }));
    /*
    if (job && job.progress) {
      job.progress(state.percent * 100);
    }
    */
  }).on('response', (response) => {
    if (response.statusCode !== 200) {
      exit(String(response.statusCode));
    }
  }).on('error', exit);
  let bz;
  if (url && url.slice(-3) === 'bz2') {
    bz = spawn('bunzip2');
  } else {
    const str = new stream.PassThrough();
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
}

queue.runReliableQueue('parse', Number(config.PARSER_PARALLELISM), (job, cb) => {
  const match = job;
  console.log(match.match_id);
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
});
