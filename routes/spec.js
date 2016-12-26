const async = require('async');
const constants = require('dotaconstants');
const config = require('../config');
// const crypto = require('crypto');
const moment = require('moment');
const queue = require('../store/queue');
const queries = require('../store/queries');
const search = require('../store/search');
const buildMatch = require('../store/buildMatch');
const buildStatus = require('../store/buildStatus');
const queryRaw = require('../store/queryRaw');
const playerFields = require('./playerFields');
const utility = require('../util/utility');
const db = require('../store/db');
const redis = require('../store/redis');
const cassandra = require('../store/cassandra');
const packageJson = require('../package.json');

const pQueue = queue.getQueue('parse');
const subkeys = playerFields.subkeys;
const countCats = playerFields.countCats;
const countPeers = utility.countPeers;

const params = {
  matchIdParam: {
    name: 'match_id',
    in: 'path',
    required: true,
    type: 'integer',
  },
  accountIdParam: {
    name: 'account_id',
    in: 'path',
    description: 'Steam32 account ID',
    required: true,
    type: 'integer',
  },
  fieldParam: {
    name: 'field',
    in: 'path',
    description: 'Field to aggregate on',
    required: true,
    type: 'string',
  },
  limitParam: {
    name: 'limit',
    in: 'query',
    description: 'Number of matches to limit to',
    required: false,
    type: 'integer',
  },
  offsetParam: {
    name: 'offset',
    in: 'query',
    description: 'Number of matches to offset start by',
    required: false,
    type: 'integer',
  },
  projectParam: {
    name: 'project',
    in: 'query',
    description: 'Fields to project (array)',
    required: false,
    type: 'string',
  },
  winParam: {
    name: 'win',
    in: 'query',
    description: 'Whether the player won',
    required: false,
    type: 'integer',
  },
  patchParam: {
    name: 'patch',
    in: 'query',
    description: 'Patch ID',
    required: false,
    type: 'integer',
  },
  gameModeParam: {
    name: 'game_mode',
    in: 'query',
    description: 'Game Mode ID',
    required: false,
    type: 'integer',
  },
  lobbyTypeParam: {
    name: 'lobby_type',
    in: 'query',
    description: 'Lobby type ID',
    required: false,
    type: 'integer',
  },
  regionParam: {
    name: 'region',
    in: 'query',
    description: 'Region ID',
    required: false,
    type: 'integer',
  },
  dateParam: {
    name: 'date',
    in: 'query',
    description: 'Days previous',
    required: false,
    type: 'integer',
  },
  laneRoleParam: {
    name: 'lane_role',
    in: 'query',
    description: 'Lane Role ID',
    required: false,
    type: 'integer',
  },
  heroIdParam: {
    name: 'hero_id',
    in: 'query',
    description: 'Hero ID',
    required: false,
    type: 'integer',
  },
  isRadiantParam: {
    name: 'is_radiant',
    in: 'query',
    description: 'Whether the player was radiant',
    required: false,
    type: 'integer',
  },
  withHeroIdParam: {
    name: 'with_hero_id',
    in: 'query',
    description: "Hero IDs on the player's team (array)",
    required: false,
    type: 'integer',
  },
  againstHeroIdParam: {
    name: 'against_hero_id',
    in: 'query',
    description: "Hero IDs against the player's team (array)",
    required: false,
    type: 'integer',
  },
  includedAccountIdParam: {
    name: 'included_account_id',
    in: 'query',
    description: 'Account IDs in the match (array)',
    required: false,
    type: 'integer',
  },
  excludedAccountIdParam: {
    name: 'excluded_account_id',
    in: 'query',
    description: 'Account IDs not in the match (array)',
    required: false,
    type: 'integer',
  },
  significantParam: {
    name: 'significant',
    in: 'query',
    description: 'Whether the match was significant for aggregation purposes',
    required: false,
    type: 'integer',
  },
  sortParam: {
    name: 'sort',
    in: 'query',
    description: 'The field to return matches sorted by in descending order',
    required: false,
    type: 'string',
  },
  minMmrParam: {
    name: 'min_mmr',
    in: 'query',
    description: 'Minimum average MMR',
    required: false,
    type: 'integer',
  },
  maxMmrParam: {
    name: 'max_mmr',
    in: 'query',
    description: 'Maximum average MMR',
    required: false,
    type: 'integer',
  },
  minTimeParam: {
    name: 'min_time',
    in: 'query',
    description: 'Minimum start time (Unix time)',
    required: false,
    type: 'integer',
  },
  maxTimeParam: {
    name: 'max_time',
    in: 'query',
    description: 'Maximum start time (Unix time)',
    required: false,
    type: 'integer',
  },
};

const playerParams = [
  params.accountIdParam,
  params.limitParam,
  params.offsetParam,
  params.winParam,
  params.patchParam,
  params.gameModeParam,
  params.lobbyTypeParam,
  params.regionParam,
  params.dateParam,
  params.laneRoleParam,
  params.heroIdParam,
  params.isRadiantParam,
  params.includedAccountIdParam,
  params.excludedAccountIdParam,
  params.withHeroIdParam,
  params.againstHeroIdParam,
  params.significantParam,
  params.sortParam,
];

const spec = {
  swagger: '2.0',
  info: {
    title: 'OpenDota API',
    description: `# Introduction
This API provides Dota 2 related data.
Please keep request rate to approximately 1/s.
`,
    version: packageJson.version,
  },
  host: 'api.opendota.com',
  basePath: '/api',
  produces: [
    'application/json',
  ],
  paths: {
    '/matches/{match_id}': {
      get: {
        summary: 'GET /',
        description: 'Match data',
        tags: [
          'matches',
        ],
        parameters: [params.matchIdParam],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                match_id: {
                  description: 'match_id',
                  type: 'number',
                },
                cluster: {
                  description: 'cluster',
                  type: 'number',
                },
                replay_salt: {
                  description: 'replay_salt',
                  type: 'number',
                },
                series_id: {
                  description: 'series_id',
                  type: 'number',
                },
                series_type: {
                  description: 'series_type',
                  type: 'number',
                },
                parties: {
                  description: 'parties',
                  type: 'object',
                },
                skill: {
                  description: 'skill',
                  type: 'number',
                },
                players: {
                  description: 'players',
                  type: 'object',
                },
                barracks_status_dire: {
                  description: 'barracks_status_dire',
                  type: 'number',
                },
                barracks_status_radiant: {
                  description: 'barracks_status_radiant',
                  type: 'number',
                },
                chat: {
                  description: 'chat',
                  type: 'object',
                },
                duration: {
                  description: 'duration',
                  type: 'number',
                },
                engine: {
                  description: 'engine',
                  type: 'number',
                },
                first_blood_time: {
                  description: 'first_blood_time',
                  type: 'number',
                },
                game_mode: {
                  description: 'game_mode',
                  type: 'number',
                },
                human_players: {
                  description: 'human_players',
                  type: 'number',
                },
                leagueid: {
                  description: 'leagueid',
                  type: 'number',
                },
                lobby_type: {
                  description: 'lobby_type',
                  type: 'number',
                },
                match_seq_num: {
                  description: 'match_seq_num',
                  type: 'number',
                },
                negative_votes: {
                  description: 'negative_votes',
                  type: 'number',
                },
                objectives: {
                  description: 'objectives',
                  type: 'object',
                },
                picks_bans: {
                  description: 'picks_bans',
                  type: 'object',
                },
                positive_votes: {
                  description: 'positive_votes',
                  type: 'number',
                },
                radiant_gold_adv: {
                  description: 'radiant_gold_adv',
                  type: 'object',
                },
                radiant_win: {
                  description: 'radiant_win',
                  type: 'boolean',
                },
                radiant_xp_adv: {
                  description: 'radiant_xp_adv',
                  type: 'object',
                },
                start_time: {
                  description: 'start_time',
                  type: 'number',
                },
                teamfights: {
                  description: 'teamfights',
                  type: 'object',
                },
                tower_status_dire: {
                  description: 'tower_status_dire',
                  type: 'number',
                },
                tower_status_radiant: {
                  description: 'tower_status_radiant',
                  type: 'number',
                },
                version: {
                  description: 'version',
                  type: 'number',
                },
                patch: {
                  description: 'patch',
                  type: 'number',
                },
                region: {
                  description: 'region',
                  type: 'number',
                },
                all_word_counts: {
                  description: 'all_word_counts',
                  type: 'object',
                },
                my_word_counts: {
                  description: 'my_word_counts',
                  type: 'object',
                },
                throw: {
                  description: 'throw',
                  type: 'number',
                },
                loss: {
                  description: 'loss',
                  type: 'number',
                },
                replay_url: {
                  description: 'replay_url',
                  type: 'string',
                },
              },
            },
          },
        },
        route: () => '/matches/:match_id/:info?',
        func: (req, res, cb) => {
          buildMatch(req.params.match_id, (err, match) => {
            if (err) {
              return cb(err);
            }
            if (!match) {
              return cb();
            }
            return res.json(match);
          });
        },
      },
    },
    '/players/{account_id}': {
      get: {
        summary: 'GET /',
        description: 'Player data',
        tags: [
          'players',
        ],
        parameters: [params.accountIdParam],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                tracked_until: {
                  description: 'tracked_until',
                  type: 'string',
                },
                solo_competitive_rank: {
                  description: 'solo_competitive_rank',
                  type: 'string',
                },
                competitive_rank: {
                  description: 'competitive_rank',
                  type: 'string',
                },
                mmr_estimate: {
                  description: 'mmr_estimate',
                  type: 'object',
                },
                profile: {
                  description: 'profile',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/players/:account_id',
        func: (req, res, cb) => {
          const accountId = Number(req.params.account_id);
          async.parallel({
            profile(cb) {
              queries.getPlayer(db, accountId, cb);
            },
            tracked_until(cb) {
              redis.zscore('tracked', accountId, cb);
            },
            solo_competitive_rank(cb) {
              redis.zscore('solo_competitive_rank', accountId, cb);
            },
            competitive_rank(cb) {
              redis.zscore('competitive_rank', accountId, cb);
            },
            mmr_estimate(cb) {
              queries.getMmrEstimate(db, redis, accountId, cb);
            },
          }, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/wl': {
      get: {
        summary: 'GET /wl',
        description: 'Win/Loss count',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                win: {
                  description: 'win',
                  type: 'number',
                },
                lose: {
                  description: 'lose',
                  type: 'number',
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/wl',
        func: (req, res, cb) => {
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
              if (utility.isRadiant(m) === m.radiant_win) {
                result.win += 1;
              } else {
                result.lose += 1;
              }
            });
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/matches': {
      get: {
        summary: 'GET /matches',
        description: 'Matches played',
        tags: [
          'players',
        ],
        parameters: playerParams.concat(params.projectParam),
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/players/:account_id/matches',
        func: (req, res, cb) => {
          // Use passed fields as additional fields, if available
          const additionalFields = req.query.project || ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'game_mode', 'version', 'kills', 'deaths', 'assists'];
          req.queryObj.project = req.queryObj.project.concat(additionalFields);
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            function render(err) {
              if (err) {
                return cb(err);
              }
              return res.json(cache);
            }
            if (err) {
              return cb(err);
            }
            if (req.queryObj.project.indexOf('skill') !== -1) {
              return queries.getMatchesSkill(db, cache, {}, render);
            }
            return render();
          });
        },
      },
    },
    '/players/{account_id}/heroes': {
      get: {
        summary: 'GET /heroes',
        description: 'Heroes played',
        tags: ['players'],
        parameters: playerParams,
        route: () => '/players/:account_id/heroes',
        func: (req, res, cb) => {
          const heroes = {};
          // prefill heroes with every hero
          Object.keys(constants.heroes).forEach((heroId) => {
            const hero = {
              hero_id: heroId,
              last_played: 0,
              games: 0,
              win: 0,
              with_games: 0,
              with_win: 0,
              against_games: 0,
              against_win: 0,
            };
            heroes[heroId] = hero;
          });
          req.queryObj.project = req.queryObj.project.concat('heroes', 'account_id', 'start_time', 'player_slot', 'radiant_win');
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            cache.forEach((m) => {
              const isRadiant = utility.isRadiant;
              const playerWin = isRadiant(m) === m.radiant_win;
              const group = m.heroes || {};
              Object.keys(group).forEach((key) => {
                const tm = group[key];
                const tmHero = tm.hero_id;
                // don't count invalid heroes
                if (tmHero in heroes) {
                  if (isRadiant(tm) === isRadiant(m)) {
                    if (tm.account_id === m.account_id) {
                      // console.log("self %s", tm_hero, tm.account_id, m.account_id);
                      heroes[tmHero].games += 1;
                      heroes[tmHero].win += playerWin ? 1 : 0;
                      if (m.start_time > heroes[tmHero].last_played) {
                        heroes[tmHero].last_played = m.start_time;
                      }
                    } else {
                      // console.log("teammate %s", tm_hero);
                      heroes[tmHero].with_games += 1;
                      heroes[tmHero].with_win += playerWin ? 1 : 0;
                    }
                  } else {
                    // console.log("opp %s", tm_hero);
                    heroes[tmHero].against_games += 1;
                    heroes[tmHero].against_win += playerWin ? 1 : 0;
                  }
                }
              });
            });
            return res.json(Object.keys(heroes).map(k =>
              heroes[k]).sort((a, b) => b.games - a.games));
          });
        },
      },
    },
    '/players/{account_id}/peers': {
      get: {
        summary: 'GET /peers',
        description: 'Players played with',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/players/:account_id/peers',
        func: (req, res, cb) => {
          req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win');
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            const teammates = countPeers(cache);
            return queries.getPeers(db, teammates, {
              account_id: req.params.account_id,
            }, (err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
          });
        },
      },
    },
    '/players/{account_id}/pros': {
      get: {
        summary: 'GET /pros',
        description: 'Pro players played with',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/players/:account_id/pros',
        func: (req, res, cb) => {
          req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win');
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            const teammates = countPeers(cache);
            return queries.getProPeers(db, teammates, {
              account_id: req.params.account_id,
            }, (err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
          });
        },
      },
    },
    '/players/{account_id}/records': {
      get: {
        summary: 'GET /records',
        description: 'Extremes in matches played',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                kills: {
                  description: 'kills',
                  type: 'object',
                },
                deaths: {
                  description: 'deaths',
                  type: 'object',
                },
                assists: {
                  description: 'assists',
                  type: 'object',
                },
                kda: {
                  description: 'kda',
                  type: 'object',
                },
                gold_per_min: {
                  description: 'gold_per_min',
                  type: 'object',
                },
                xp_per_min: {
                  description: 'xp_per_min',
                  type: 'object',
                },
                last_hits: {
                  description: 'last_hits',
                  type: 'object',
                },
                denies: {
                  description: 'denies',
                  type: 'object',
                },
                lane_efficiency_pct: {
                  description: 'lane_efficiency_pct',
                  type: 'object',
                },
                duration: {
                  description: 'duration',
                  type: 'object',
                },
                level: {
                  description: 'level',
                  type: 'object',
                },
                hero_damage: {
                  description: 'hero_damage',
                  type: 'object',
                },
                tower_damage: {
                  description: 'tower_damage',
                  type: 'object',
                },
                hero_healing: {
                  description: 'hero_healing',
                  type: 'object',
                },
                stuns: {
                  description: 'stuns',
                  type: 'object',
                },
                tower_kills: {
                  description: 'tower_kills',
                  type: 'object',
                },
                neutral_kills: {
                  description: 'neutral_kills',
                  type: 'object',
                },
                courier_kills: {
                  description: 'courier_kills',
                  type: 'object',
                },
                purchase_tpscroll: {
                  description: 'purchase_tpscroll',
                  type: 'object',
                },
                purchase_ward_observer: {
                  description: 'purchase_ward_observer',
                  type: 'object',
                },
                purchase_ward_sentry: {
                  description: 'purchase_ward_sentry',
                  type: 'object',
                },
                purchase_gem: {
                  description: 'purchase_gem',
                  type: 'object',
                },
                purchase_rapier: {
                  description: 'purchase_rapier',
                  type: 'object',
                },
                pings: {
                  description: 'pings',
                  type: 'object',
                },
                throw: {
                  description: 'throw',
                  type: 'object',
                },
                comeback: {
                  description: 'comeback',
                  type: 'object',
                },
                stomp: {
                  description: 'stomp',
                  type: 'object',
                },
                loss: {
                  description: 'loss',
                  type: 'object',
                },
                actions_per_min: {
                  description: 'actions_per_min',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/records',
        func: (req, res, cb) => {
          const result = {};
          req.queryObj.project = req.queryObj.project.concat(Object.keys(subkeys)).concat('hero_id', 'start_time');
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            cache.forEach((m) => {
              Object.keys(subkeys).forEach((key) => {
                if (!result[key] || (m[key] > result[key][key])) {
                  result[key] = m;
                }
              });
            });
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/counts': {
      get: {
        summary: 'GET /counts',
        description: 'Categorical counts',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                leaver_status: {
                  description: 'leaver_status',
                  type: 'object',
                },
                game_mode: {
                  description: 'game_mode',
                  type: 'object',
                },
                lobby_type: {
                  description: 'lobby_type',
                  type: 'object',
                },
                lane_role: {
                  description: 'lane_role',
                  type: 'object',
                },
                region: {
                  description: 'region',
                  type: 'object',
                },
                patch: {
                  description: 'patch',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/counts',
        func: (req, res, cb) => {
          const result = {};
          Object.keys(countCats).forEach((key) => {
            result[key] = {};
          });
          req.queryObj.project = req.queryObj.project.concat(Object.keys(countCats));
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            cache.forEach((m) => {
              Object.keys(countCats).forEach((key) => {
                if (!result[key][Math.floor(m[key])]) {
                  result[key][Math.floor(m[key])] = {
                    games: 0,
                    win: 0,
                  };
                }
                result[key][Math.floor(m[key])].games += 1;
                const won = Number(m.radiant_win === utility.isRadiant(m));
                result[key][Math.floor(m[key])].win += won;
              });
            });
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/histograms/{field}': {
      get: {
        summary: 'GET /histograms',
        description: 'Distribution of matches in a single stat',
        tags: [
          'players',
        ],
        parameters: playerParams.concat(params.fieldParam),
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/players/:account_id/histograms/:field',
        func: (req, res, cb) => {
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
            return res.json(bucketArray);
          });
        },
      },
    },
    '/players/{account_id}/wardmap': {
      get: {
        summary: 'GET /wardmap',
        description: 'Wards placed in matches played',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                obs: {
                  description: 'obs',
                  type: 'object',
                },
                sen: {
                  description: 'sen',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/wardmap',
        func: (req, res, cb) => {
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
              Object.keys(result).forEach((key) => {
                utility.mergeObjects(result[key], m[key]);
              });
            });
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/wordcloud': {
      get: {
        summary: 'GET /wordcloud',
        description: 'Words said/read in matches played',
        tags: [
          'players',
        ],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                my_word_counts: {
                  description: 'my_word_counts',
                  type: 'object',
                },
                all_word_counts: {
                  description: 'all_word_counts',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/wordcloud',
        func: (req, res, cb) => {
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
              Object.keys(result).forEach((key) => {
                utility.mergeObjects(result[key], m[key]);
              });
            });
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/ratings': {
      get: {
        summary: 'GET /ratings',
        description: 'Player rating history',
        tags: [
          'players',
        ],
        parameters: [params.accountIdParam],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/players/:account_id/ratings',
        func: (req, res, cb) => {
          queries.getPlayerRatings(db, req.params.account_id, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/rankings': {
      get: {
        summary: 'GET /rankings',
        description: 'Player hero rankings',
        tags: [
          'players',
        ],
        parameters: [params.accountIdParam],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/players/:account_id/rankings',
        func: (req, res, cb) => {
          queries.getPlayerRankings(redis, req.params.account_id, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/players/{account_id}/refresh': {
      post: {
        summary: 'POST /refresh',
        description: 'Refresh player match history',
        tags: [
          'players',
        ],
        parameters: [params.accountIdParam],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
        route: () => '/players/:account_id/refresh',
        func: (req, res, cb) => {
          redis.lpush('fhQueue', JSON.stringify({
            account_id: req.params.account_id || '1',
          }), (err, length) => {
            if (err) {
              return cb(err);
            }
            return res.json({
              length,
            });
          });
        },
      },
    },
    '/proPlayers': {
      get: {
        summary: 'GET /',
        description: 'Get list of pro players',
        tags: ['pro players'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/proPlayers',
        func: (req, res, cb) => {
          db.select()
            .from('players')
            .rightJoin('notable_players', 'players.account_id', 'notable_players.account_id')
            .orderBy('notable_players.account_id', 'asc')
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
        },
      },
    },
    '/proMatches': {
      get: {
        summary: 'GET /',
        description: 'Get list of pro matches',
        tags: ['pro matches'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/proMatches',
        func: (req, res, cb) => {
          db.raw(`
          SELECT match_id, duration, start_time, 
          radiant_team_id, radiant.name as radiant_name, 
          dire_team_id, dire.name as dire_name, 
          leagueid, leagues.name as league_name,
          series_id, series_type
          FROM matches
          LEFT JOIN teams radiant
          ON radiant.team_id = matches.radiant_team_id
          LEFT JOIN teams dire
          ON dire.team_id = matches.dire_team_id
          LEFT JOIN leagues USING(leagueid)
          LEFT JOIN match_gcdata USING(match_id)
          ORDER BY match_id DESC
          LIMIT 100
          `)
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result.rows);
            });
        },
      },
    },
    '/publicMatches': {
      get: {
        summary: 'GET /',
        description: 'Get list of randomly sampled public matches',
        tags: ['public matches'],
        parameters: [
          params.minMmrParam,
          params.maxMmrParam,
          params.minTimeParam,
          params.maxTimeParam,
        ],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/publicMatches',
        func: (req, res, cb) => {
          const minMmr = req.query.min_mmr || 0;
          const maxMmr = req.query.max_mmr || Math.pow(2, 31) - 1;
          const minTime = req.query.min_time || 0;
          const maxTime = req.query.max_time || Math.pow(2, 31) - 1;
          db.raw(`
          SELECT * FROM public_matches
          WHERE TRUE
          AND avg_mmr > ?
          AND avg_mmr < ?
          AND start_time > ?
          AND start_time < ?
          ORDER BY match_id desc
          LIMIT 100
          `, [minMmr, maxMmr, minTime, maxTime])
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result.rows);
            });
        },
      },
    },
    '/heroStats': {
      get: {
        summary: 'GET /',
        description: 'Get stats about hero performance in recent matches',
        tags: ['hero stats'],
        parameters: [
          params.minMmrParam,
          params.maxMmrParam,
          params.minTimeParam,
          params.maxTimeParam,
        ],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/heroStats',
        func: (req, res, cb) => {
          const minMmr = req.query.min_mmr || 0;
          const maxMmr = req.query.max_mmr || Math.pow(2, 31) - 1;
          const minTime = req.query.min_time || 0;
          const maxTime = req.query.max_time || Math.pow(2, 31) - 1;
          async.parallel({
            publicHeroes(cb) {
            db.raw(`
            SELECT 
            sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as public_win, 
            count(*) as public_count, 
            hero_id 
            FROM public_player_matches 
            JOIN 
            (SELECT * FROM public_matches 
            WHERE TRUE
            AND avg_mmr > ?
            AND avg_mmr < ?
            AND start_time > ?
            AND start_time < ?
            ORDER BY match_id desc LIMIT 10000) 
            matches_list USING(match_id)
            WHERE hero_id > 0
            GROUP BY hero_id
            ORDER BY hero_id
          `, [minMmr, maxMmr, minTime, maxTime])
            .asCallback(cb);
            },
            proHeroes(cb) {
            db.raw(`
            SELECT 
            sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as pro_win, 
            count(*) as pro_count,
            hero_id
            FROM player_matches
            JOIN matches USING(match_id)
            WHERE hero_id > 0
            AND start_time > ?
            AND start_time < ?
            GROUP BY hero_id
            ORDER BY hero_id
          `, [minTime, maxTime])
            .asCallback(cb);
            },
            proBans(cb) {
            db.raw(`
            SELECT 
            count(*) ban_count,
            hero_id
            FROM picks_bans
            JOIN matches USING(match_id)
            WHERE hero_id > 0
            AND start_time > ?
            AND start_time < ?
            AND is_pick IS FALSE
            GROUP BY hero_id
            ORDER BY hero_id
          `, [minTime, maxTime])
            .asCallback(cb);                
            }
          }, (err, result) => {
              if (err) {
                return cb(err);
              }
              // Build object keyed by hero_id for each result array
              const objectResponse = JSON.parse(JSON.stringify(constants.heroes));
              Object.keys(result).forEach(key => {
                result[key].rows.forEach(row => {
                  objectResponse[row.hero_id] = Object.assign({}, objectResponse[row.hero_id], row);
                });
              });
              // Assemble the result array
              // hero_id
              // P+B%
              // P% - pro_count / (sum of all pro counts / 10)
              // B% - ban_count / (sum of all pro counts / 10)
              // W% - pro_win / pro_count
              // PubP% public_count / (sum of all public counts / 10)
              // PubW% public_win / public_count
              return res.json(Object.keys(objectResponse).map(key => objectResponse[key]));
            });
        },
      },
    },
    '/explorer': {
      get: {
        summary: 'GET /',
        description: 'Submit arbitrary SQL queries to the database',
        tags: ['explorer'],
        parameters: [{
          name: 'sql',
          in: 'query',
          description: 'The PostgreSQL query as percent-encoded string.',
          required: false,
          type: 'string',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
        route: () => '/explorer',
        func: (req, res) => {
          // TODO handle NQL (@nicholashh query language)
          const input = req.query.sql;
          return queryRaw(input, (err, result) => {
            if (err) {
              console.error(err);
            }
            const final = Object.assign({}, result, {
              err: err ? err.stack : err,
            });
            return res.status(err ? 400 : 200).json(final);
          });
        },

      },
    },
    '/metadata': {
      get: {
        summary: 'GET /',
        description: 'Site metadata',
        tags: [
          'metadata',
        ],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                banner: {
                  description: 'banner',
                  type: 'object',
                },
                cheese: {
                  description: 'cheese',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/metadata',
        func: (req, res, cb) => {
          async.parallel({
            banner(cb) {
              redis.get('banner', cb);
            },
            cheese(cb) {
              redis.get('cheese_goal', (err, result) => cb(err, {
                cheese: result,
                goal: config.GOAL,
              }));
            },
            user(cb) {
              cb(null, req.user);
            },
          }, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/distributions': {
      get: {
        summary: 'GET /',
        description: 'Distributions of MMR data',
        tags: [
          'distributions',
        ],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                mmr: {
                  description: 'mmr',
                  type: 'object',
                },
                country_mmr: {
                  description: 'country_mmr',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/distributions',
        func: (req, res, cb) => {
          queries.getDistributions(redis, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/search': {
      get: {
        summary: 'GET /',
        description: 'Search players by personaname',
        tags: [
          'search',
        ],
        parameters: [{
          name: 'q',
          in: 'query',
          description: 'Search string',
          required: true,
          type: 'string',
        }, {
          name: 'similarity',
          in: 'query',
          description: 'Minimum similarity threshold, between 0 and 1',
          required: false,
          type: 'number',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/search',
        func: (req, res, cb) => {
          if (!req.query.q) {
            return res.status(400).json([]);
          }
          return search(req.query, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/rankings': {
      get: {
        summary: 'GET /',
        description: 'Top players by hero',
        tags: [
          'rankings',
        ],
        parameters: [{
          name: 'hero_id',
          in: 'query',
          description: 'Hero ID',
          required: true,
          type: 'string',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                hero_id: {
                  description: 'hero_id',
                  type: 'number',
                },
                rankings: {
                  description: 'rankings',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/rankings',
        func: (req, res, cb) => {
          queries.getHeroRankings(db, redis, req.query.hero_id, {}, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/benchmarks': {
      get: {
        summary: 'GET /',
        description: 'Benchmarks of average stat values for a hero',
        tags: [
          'benchmarks',
        ],
        parameters: [{
          name: 'hero_id',
          in: 'query',
          description: 'Hero ID',
          required: true,
          type: 'string',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
              properties: {
                hero_id: {
                  description: 'hero_id',
                  type: 'number',
                },
                result: {
                  description: 'result',
                  type: 'object',
                },
              },
            },
          },
        },
        route: () => '/benchmarks',
        func: (req, res, cb) => {
          queries.getHeroBenchmarks(db, redis, {
            hero_id: req.query.hero_id,
          }, (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        },
      },
    },
    '/status': {
      get: {
        summary: 'GET /',
        description: 'Get current service statistics',
        tags: ['status'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
        route: () => '/status',
        func: (req, res, cb) => {
          buildStatus(db, redis, (err, status) => {
            if (err) {
              return cb(err);
            }
            return res.json(status);
          });
        },
      },
    },
    '/health': {
      get: {
        summary: 'GET /',
        description: 'Get service health data',
        tags: ['health'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
        route: () => '/health/:metric?',
        func: (req, res, cb) => {
          redis.hgetall('health', (err, result) => {
            if (err) {
              return cb(err);
            }
            const response = result || {};
            Object.keys(response).forEach((key) => {
              response[key] = JSON.parse(response[key]);
            });
            if (!req.params.metric) {
              return res.json(response);
            }
            const single = response[req.params.metric];
            const healthy = single.metric < single.threshold;
            return res.status(healthy ? 200 : 500).json(single);
          });
        },
      },
    },
    '/request/{jobId}': {
      get: {
        summary: 'GET /',
        description: 'Get parse request state',
        tags: ['request'],
        parameters: [{
          name: 'jobId',
          in: 'path',
          description: 'The job ID to query.',
          required: true,
          type: 'string',
        }],
        route: () => '/request/:jobId',
        func: (req, res, cb) => pQueue.getJob(req.params.jobId).then((job) => {
          if (job) {
            return job.getState().then(state => res.json({
              jobId: job.jobId,
              data: job.data,
              state,
              progress: job.progress(),
            })).catch(cb);
          }
          return res.json({
            state: 'failed',
          });
        }).catch(cb),
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
      },
    },
    '/request/{match_id}': {
      post: {
        summary: 'POST /',
        description: 'Submit a new parse request',
        tags: ['request'],
        parameters: [{
          name: 'match_id',
          in: 'path',
          required: true,
          type: 'integer',
        }],
        route: () => '/request/:match_id',
        func: (req, res) => {
          const matchId = req.params.match_id;
          const match = {
            match_id: Number(matchId),
          };
          /*
          if (req.file) {
            console.log(req.file);
            const hash = crypto.createHash('md5');
            hash.update(req.file.buffer);
            const key = hash.digest('hex');
            redis.setex(new Buffer(`upload_blob:${key}`), 60 * 60, req.file.buffer);
            match = {
              replay_blob_key: key,
            }
          }
          */

          function exitWithJob(err, parseJob) {
            res.status(err ? 400 : 200).json({
              err,
              job: {
                jobId: parseJob && parseJob.jobId,
              },
            });
          }

          if (match && match.match_id) {
            // match id request, get data from API
            return utility.getData(utility.generateJob('api_details', match).url, (err, body) => {
              if (err) {
                // couldn't get data from api, non-retryable
                return exitWithJob(JSON.stringify(err));
              }
              // match details response
              const match = body.result;
              redis.zadd('requests', moment().format('X'), `${moment().format('X')}_${match.match_id}`);
              return queries.insertMatch(match, {
                type: 'api',
                attempts: 1,
                lifo: true,
                cassandra,
                forceParse: true,
              }, exitWithJob);
            });
          }
          return exitWithJob('invalid input');
          /*
          else {
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
          */
        },
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
      },
    },
    /*
    '/matchups': {
      get: {
        summary: 'GET /',
        description: 'Get hero matchups (teammates and opponents)',
        tags: ['matchups'],
        parameters: [{
          name: 't0',
          in: 'query',
          description: 'Hero 0 ID',
          required: false,
          type: 'number',
        }, {
          name: 't1',
          in: 'query',
          description: 'Hero 1 ID',
          required: false,
          type: 'number',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'object',
            },
          },
        },
        route: () => '/matchups',
        func: (req, res, cb) => {
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
            return res.json({
              t0: Number(result.t0) || 0,
              t1: Number(result.t1) || 0,
            });
          });
        },
      },
    },
    */
    '/heroes': {
      get: {
        summary: 'GET /',
        description: 'Get hero data',
        tags: ['heroes'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/heroes',
        func: (req, res, cb) => {
          db.select()
            .from('heroes')
            .orderBy('id', 'asc')
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
        },
      },
    },
    '/leagues': {
      get: {
        summary: 'GET /',
        description: 'Get league data',
        tags: ['leagues'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/leagues',
        func: (req, res, cb) => {
          db.select()
            .from('leagues')
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
        },
      },
    },
    '/replays': {
      get: {
        summary: 'GET /',
        description: 'Get replay data',
        tags: ['replays'],
        parameters: [{
          name: 'match_id',
          in: 'query',
          description: 'Match IDs (array)',
          required: true,
          type: 'integer',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        route: () => '/replays',
        func: (req, res, cb) => {
          db.select(['match_id', 'cluster', 'replay_salt'])
            .from('match_gcdata')
            .whereIn('match_id', (req.query.match_id || []).slice(0, 100))
            .asCallback((err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result);
            });
        },
      },
    },
  },
};
module.exports = spec;
