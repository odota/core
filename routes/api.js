const express = require('express');
const async = require('async');
const api = express.Router();
const constants = require('dotaconstants');
const config = require('../config');
const request = require('request');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const multer = require('multer')({
  inMemory: true,
  fileSize: 100 * 1024 * 1024, // no larger than 100mb
});
const moment = require('moment');
const queue = require('../store/queue');
const pQueue = queue.getQueue('parse');
const queries = require('../store/queries');
const search = require('../store/search');
const buildMatch = require('../store/buildMatch');
const buildStatus = require('../store/buildStatus');
const queryRaw = require('../store/queryRaw');
const player_fields = constants.player_fields;
const subkeys = player_fields.subkeys;
const countCats = player_fields.countCats;
const utility = require('../util/utility');
const filterDeps = require('../util/filterDeps');
const countPeers = utility.countPeers;
const rc_secret = config.RECAPTCHA_SECRET_KEY;
module.exports = function (db, redis, cassandra) {
  api.use((req, res, cb) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Headers', 'origin, content-type, accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    cb();
  });
  api.get('/constants', (req, res, cb) => {
    res.header('Cache-Control', 'max-age=604800, public');
    res.json(constants);
  });
  api.get('/metadata', (req, res, cb) => {
    async.parallel({
      banner(cb) {
        redis.get('banner', cb);
      },
      cheese(cb) {
        redis.get('cheese_goal', (err, result) => {
          return cb(err, {
            cheese: result,
            goal: config.GOAL,
          });
        });
      },
      user(cb) {
        cb(null, req.user);
      },
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.get('/items', (req, res) => {
    res.json(constants.items[req.query.name]);
  });
  api.get('/abilities', (req, res) => {
    res.json(constants.abilities[req.query.name]);
  });
  api.get('/matches/:match_id/:info?', (req, res, cb) => {
    buildMatch(req.params.match_id, {
      db,
      redis,
      cassandra,
    }, (err, match) => {
      if (err) {
        return cb(err);
      }
      if (!match) {
        return cb();
      }
      res.json(match);
    });
  });
  // basic player data
  api.get('/players/:account_id', (req, res, cb) => {
    const account_id = Number(req.params.account_id);
    async.parallel({
      profile(cb) {
        queries.getPlayer(db, account_id, cb);
      },
      tracked_until(cb) {
        redis.zscore('tracked', account_id, cb);
      },
      solo_competitive_rank(cb) {
        redis.zscore('solo_competitive_rank', account_id, cb);
      },
      competitive_rank(cb) {
        redis.zscore('competitive_rank', account_id, cb);
      },
      mmr_estimate(cb) {
        queries.getMmrEstimate(db, redis, account_id, cb);
      },
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.use('/players/:account_id/:info?', (req, res, cb) => {
    if (Number.isNaN(req.params.account_id)) {
      return cb('invalid account_id');
    }
    if (req.params.info !== 'matches') {
      // We want to show insignificant matches in match view
      // Set default significant to true in all other views
      req.query.significant = [1];
    }
    let filterCols = [];
    for (const key in req.query) {
      // numberify and arrayify everything in query
      req.query[key] = [].concat(req.query[key]).map((e) => {
        return isNaN(Number(e)) ? e : Number(e);
      });
      // build array of required projections due to filters
      filterCols = filterCols.concat(filterDeps[key] || []);
    }
    req.queryObj = {
      project: ['match_id'].concat(filterCols).concat((req.query.sort || []).filter(f => subkeys[f])),
      filter: req.query || {},
      sort: req.query.sort,
      limit: Number(req.query.limit),
      offset: Number(req.query.offset),
    };
    cb();
  });
  api.get('/players/:account_id/wordcloud', (req, res, cb) => {
    const result = {
      my_word_counts: {},
      all_word_counts: {},
    };
    req.queryObj.project = req.queryObj.project.concat(Object.keys(result));
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        for (const key in result) {
          utility.mergeObjects(result[key], m[key]);
        }
      });
      res.json(result);
    });
  });
  api.get('/players/:account_id/wardmap', (req, res, cb) => {
    const result = {
      obs: {},
      sen: {},
    };
    req.queryObj.project = req.queryObj.project.concat(Object.keys(result));
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        for (const key in result) {
          utility.mergeObjects(result[key], m[key]);
        }
      });
      // generally position data function is used to generate heatmap data for each player in a natch
      // we use it here to generate a single heatmap for aggregated counts
      const d = {
        obs: true,
        sen: true,
      };
      utility.generatePositionData(d, result);
      res.json(d);
    });
  });
  api.get('/players/:account_id/wl', (req, res, cb) => {
    const result = {
      win: 0,
      lose: 0,
    };
    req.queryObj.project = req.queryObj.project.concat('player_slot', 'radiant_win');
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        if (utility.isRadiant(m) == m.radiant_win) {
          result.win += 1;
        } else {
          result.lose += 1;
        }
      });
      res.json(result);
    });
  });
  api.get('/players/:account_id/records', (req, res, cb) => {
    const result = {};
    req.queryObj.project = req.queryObj.project.concat(Object.keys(subkeys)).concat('hero_id', 'start_time');
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        for (const key in subkeys) {
          if (!result[key] || (m[key] > result[key][key])) {
            result[key] = m;
          }
        }
      });
      res.json(result);
    });
  });
  api.get('/players/:account_id/counts', (req, res, cb) => {
    const result = {};
    for (const key in countCats) {
      result[key] = {};
    }
    req.queryObj.project = req.queryObj.project.concat(Object.keys(countCats));
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        for (const key in countCats) {
          if (!result[key][~~m[key]]) {
            result[key][~~m[key]] = {
              games: 0,
              win: 0,
            };
          }
          result[key][~~m[key]].games += 1;
          result[key][~~m[key]].win += Number(m.radiant_win === utility.isRadiant(m));
        }
      });
      res.json(result);
    });
  });
  api.get('/players/:account_id/heroes', (req, res, cb) => {
    const heroes = {};
    // prefill heroes with every hero
    for (const hero_id in constants.heroes) {
      const hero = {
        hero_id,
        last_played: 0,
        games: 0,
        win: 0,
        with_games: 0,
        with_win: 0,
        against_games: 0,
        against_win: 0,
      };
      heroes[hero_id] = hero;
    }
    req.queryObj.project = req.queryObj.project.concat('heroes', 'account_id', 'start_time', 'player_slot', 'radiant_win');
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      cache.forEach((m) => {
        const isRadiant = utility.isRadiant;
        const player_win = isRadiant(m) === m.radiant_win;
        const group = m.heroes || {};
        for (const key in group) {
          const tm = group[key];
          const tm_hero = tm.hero_id;
          // don't count invalid heroes
          if (tm_hero in heroes) {
            if (isRadiant(tm) === isRadiant(m)) {
              if (tm.account_id === m.account_id) {
                // console.log("self %s", tm_hero, tm.account_id, m.account_id);
                heroes[tm_hero].games += 1;
                heroes[tm_hero].win += player_win ? 1 : 0;
                if (m.start_time > heroes[tm_hero].last_played) {
                  heroes[tm_hero].last_played = m.start_time;
                }
              } else {
                // console.log("teammate %s", tm_hero);
                heroes[tm_hero].with_games += 1;
                heroes[tm_hero].with_win += player_win ? 1 : 0;
              }
            } else {
              // console.log("opp %s", tm_hero);
              heroes[tm_hero].against_games += 1;
              heroes[tm_hero].against_win += player_win ? 1 : 0;
            }
          }
        }
      });
      res.json(Object.keys(heroes).map((k) => {
        return heroes[k];
      }).sort((a, b) => {
        return b.games - a.games;
      }));
    });
  });
  api.get('/players/:account_id/peers', (req, res, cb) => {
    req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win');
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      const teammates = countPeers(cache);
      queries.getPeers(db, teammates, {
        account_id: req.params.account_id,
      }, (err, result) => {
        if (err) {
          return cb(err);
        }
        res.json(result);
      });
    });
  });
  api.get('/players/:account_id/pros', (req, res, cb) => {
    req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win');
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      const teammates = countPeers(cache);
      queries.getProPeers(db, teammates, {
        account_id: req.params.account_id,
      }, (err, result) => {
        if (err) {
          return cb(err);
        }
        res.json(result);
      });
    });
  });
  api.get('/players/:account_id/histograms/:field', (req, res, cb) => {
    const field = req.params.field;
    req.queryObj.project = req.queryObj.project.concat('radiant_win', 'player_slot').concat([field].filter(f => subkeys[f]));
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      const buckets = 40;
      // Find the maximum value to determine how large each bucket should be
      const max = Math.max(...cache.map(m => m[field]));
      // Round the bucket size up to the nearest integer
      const bucketSize = Math.ceil((max + 1) / buckets);
      const bucketArray = Array.from({
        length: buckets,
      }, (value, index) => ({
        x: bucketSize * index,
        games: 0,
        win: 0,
      }));
      cache.forEach((m) => {
        if (m[field] || m[field] === 0) {
          const index = Math.floor(m[field] / bucketSize);
          if (bucketArray[index]) {
            bucketArray[index].games += 1;
            bucketArray[index].win += utility.isRadiant(m) === m.radiant_win ? 1 : 0;
          }
        }
      });
      res.json(bucketArray);
    });
  });
  api.get('/players/:account_id/matches', (req, res, cb) => {
    // Use passed fields as additional fields, if available
    const additionalFields = req.query.project || ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'game_mode', 'version', 'kills', 'deaths', 'assists'];
    req.queryObj.project = req.queryObj.project.concat(additionalFields);
    queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
      if (err) {
        return cb(err);
      }
      if (req.queryObj.project.indexOf('skill') !== -1) {
        queries.getMatchesSkill(db, cache, {}, render);
      } else {
        render();
      }

      function render(err) {
        if (err) {
          return cb(err);
        }
        return res.json(cache);
      }
    });
  });
  // non-match based
  api.get('/players/:account_id/ratings', (req, res, cb) => {
    queries.getPlayerRatings(db, req.params.account_id, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.get('/players/:account_id/rankings', (req, res, cb) => {
    queries.getPlayerRankings(redis, req.params.account_id, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.post('/players/:account_id/refresh', (req, res, cb) => {
    console.log(req.body);
    redis.lpush('fhQueue', JSON.stringify({
      account_id: req.params.account_id || '1',
    }), (err, length) => {
      if (err) {
        return cb(err);
      }
      res.json({
        length,
      });
    });
  });
  api.get('/explorer', (req, res, cb) => {
    // TODO handle NQL (@nicholashh query language)
    const input = decodeURIComponent(req.query.sql);
    return queryRaw(input, (err, result) => {
      if (err) {
        console.error(err);
      }
      const final = Object.assign({}, result, {
        err: err ? err.stack : err,
      });
      res.status(err ? 400 : 200).json(final);
    });
  });
  api.get('/distributions', (req, res, cb) => {
    queries.getDistributions(redis, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.get('/rankings', (req, res, cb) => {
    queries.getHeroRankings(db, redis, req.query.hero_id, {}, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.get('/benchmarks', (req, res, cb) => {
    queries.getHeroBenchmarks(db, redis, {
      hero_id: req.query.hero_id,
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.get('/status', (req, res, cb) => {
    buildStatus(db, redis, (err, status) => {
      if (err) {
        return cb(err);
      }
      res.json(status);
    });
  });
  api.get('/search', (req, res, cb) => {
    if (!req.query.q) {
      return cb(400);
    }
    search(db, req.query.q, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json(result);
    });
  });
  api.get('/health/:metric?', (req, res, cb) => {
    redis.hgetall('health', (err, result) => {
      if (err) {
        return cb(err);
      }
      for (const key in result) {
        result[key] = JSON.parse(result[key]);
      }
      if (!req.params.metric) {
        res.json(result);
      } else {
        const single = result[req.params.metric];
        const healthy = single.metric < single.threshold;
        res.status(healthy ? 200 : 500).json(single);
      }
    });
  });
  api.post('/request_job', multer.single('replay_blob'), (req, res, cb) => {
    request.post('https://www.google.com/recaptcha/api/siteverify', {
      form: {
        secret: rc_secret,
        response: req.body.response,
      },
    }, (err, resp, body) => {
      if (err) {
        return cb(err);
      }
      try {
        body = JSON.parse(body);
      } catch (err) {
        return res.render({
          error: err,
        });
      }
      const match_id = Number(req.body.match_id);
      let match;
      if (!body.success && config.ENABLE_RECAPTCHA && !req.file) {
        console.log('failed recaptcha');
        return res.json({
          error: 'Recaptcha Failed!',
        });
      } else if (req.file) {
        console.log(req.file);
        const hash = crypto.createHash('md5');
        hash.update(req.file.buffer);
        const key = hash.digest('hex');
        redis.setex(new Buffer(`upload_blob:${key}`), 60 * 60, req.file.buffer);
        match = {
          replay_blob_key: key,
        };
      } else if (match_id && !Number.isNaN(match_id)) {
        match = {
          match_id,
        };
      }

      function exitWithJob(err, parseJob) {
        res.status(err ? 400 : 200).json({
          error: err,
          job: {
            jobId: parseJob.jobId,
          },
        });
      }

      if (!match) {
        return exitWithJob('invalid input', {});
      } else if (match && match.match_id) {
        // match id request, get data from API
        utility.getData(utility.generateJob('api_details', match).url, (err, body) => {
          if (err) {
            // couldn't get data from api, non-retryable
            return cb(JSON.stringify(err));
          }
          // match details response
          const match = body.result;
          redis.zadd('requests', moment().format('X'), `${moment().format('X')}_${match.match_id}`);
          queries.insertMatch(db, redis, match, {
            type: 'api',
            attempts: 1,
            lifo: true,
            cassandra,
            forceParse: true,
          }, exitWithJob);
        });
      } else {
        // file upload request
        return pQueue.add({
          id: `${moment().format('X')}_${match.match_id}`,
          payload: match,
        }, {
          lifo: true,
          attempts: 1,
        })
          .then(parseJob => exitWithJob(null, parseJob))
          .catch(exitWithJob);
      }
    });
  });
  api.get('/request_job', (req, res, cb) => {
    return pQueue.getJob(req.query.id).then((job) => {
      if (job) {
        return job.getState().then((state) => {
          return res.json({
            jobId: job.jobId,
            data: job.data,
            state,
            progress: job.progress(),
          });
        }).catch(cb);
      } else {
        res.json({
          state: 'failed',
        });
      }
    }).catch(cb);
  });
  api.get('/matchups', (req, res, cb) => {
    // accept as input two arrays of up to 5
    const t0 = [].concat(req.query.t0 || []).slice(0, 5);
    const t1 = [].concat(req.query.t1 || []).slice(0, 5);
    // return wins of each team
    async.parallel({
      t0(cb) {
        redis.hget('matchups', utility.matchupToString(t0, t1, true), cb);
      },
      t1(cb) {
        redis.hget('matchups', utility.matchupToString(t0, t1, false), cb);
      },
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      res.json({
        t0: Number(result.t0) || 0,
        t1: Number(result.t1) || 0,
      });
    });
  });
  api.get('/heroes', (req, res, cb) => {
    db.select().from('heroes').orderBy('id', 'asc').asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
  });
  api.get('/leagues', (req, res, cb) => {
    db.select().from('leagues').asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
  });
  api.get('/replays', (req, res, cb) => {
    db.select(['match_id', 'cluster', 'replay_salt']).from('match_gcdata').whereIn('match_id', req.query.match_id.slice(0, 100)).asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return res.json(result);
    });
  });
  return api;
};
