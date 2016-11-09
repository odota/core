const async = require('async');
const constants = require('dotaconstants');
const config = require('../config');
const request = require('request');
const crypto = require('crypto');
const moment = require('moment');
const queue = require('../store/queue');
const pQueue = queue.getQueue('parse');
const queries = require('../store/queries');
const search = require('../store/search');
const buildMatch = require('../store/buildMatch');
const buildStatus = require('../store/buildStatus');
const queryRaw = require('../store/queryRaw');
const playerFields = require('./playerFields');
const subkeys = playerFields.subkeys;
const countCats = playerFields.countCats;
const utility = require('../util/utility');
const countPeers = utility.countPeers;
const rc_secret = config.RECAPTCHA_SECRET_KEY;
const db = require('../store/db');
const redis = require('../store/redis');
const cassandra = require('../store/cassandra');
const package = require('../package.json');
const spec = {
  "swagger": "2.0",
  "info": {
    "title": "OpenDota API",
    "description": `# Introduction
This API provides Dota 2 related data.
Please keep request rate to approximately 1/s.
`,
    "version": package.version,
  },
  "host": "api.opendota.com",
  "basePath": "/api",
  "produces": [
    "application/json"
  ],
  "parameters": {
    "accountIdParam": {
      "name": "account_id",
      "in": "path",
      "description": "Steam32 account ID",
      "required": true,
      "type": "integer"
    },
    "fieldParam": {
      "name": "field",
      "in": "path",
      "description": "Field to aggregate on",
      "required": true,
      "type": "string"
    },
    "limitParam": {
      "name": "limit",
      "in": "query",
      "description": "Number of matches to limit to",
      "required": false,
      "type": "integer"
    },
    "offsetParam": {
      "name": "offset",
      "in": "query",
      "description": "Number of matches to offset start by",
      "required": false,
      "type": "integer"
    },
    "projectParam": {
      "name": "project",
      "in": "query",
      "description": "Fields to project (array)",
      "required": false,
      "type": "string"
    },
    "winParam": {
      "name": "win",
      "in": "query",
      "description": "Whether the player won",
      "required": false,
      "type": "integer"
    },
    "patchParam": {
      "name": "patch",
      "in": "query",
      "description": "Patch ID",
      "required": false,
      "type": "integer"
    },
    "gameModeParam": {
      "name": "game_mode",
      "in": "query",
      "description": "Game Mode ID",
      "required": false,
      "type": "integer"
    },
    "lobbyTypeParam": {
      "name": "lobby_type",
      "in": "query",
      "description": "Lobby type ID",
      "required": false,
      "type": "integer"
    },
    "regionParam": {
      "name": "region",
      "in": "query",
      "description": "Region ID",
      "required": false,
      "type": "integer"
    },
    "dateParam": {
      "name": "date",
      "in": "query",
      "description": "Days previous",
      "required": false,
      "type": "integer"
    },
    "laneRoleParam": {
      "name": "lane_role",
      "in": "query",
      "description": "Lane Role ID",
      "required": false,
      "type": "integer"
    },
    "heroIdParam": {
      "name": "hero_id",
      "in": "query",
      "description": "Hero ID",
      "required": false,
      "type": "integer"
    },
    "isRadiantParam": {
      "name": "is_radiant",
      "in": "query",
      "description": "Whether the player was radiant",
      "required": false,
      "type": "integer"
    },
    "withHeroIdParam": {
      "name": "with_hero_id",
      "in": "query",
      "description": "Hero IDs on the player's team (array)",
      "required": false,
      "type": "integer"
    },
    "againstHeroIdParam": {
      "name": "against_hero_id",
      "in": "query",
      "description": "Hero IDs against the player's team (array)",
      "required": false,
      "type": "integer"
    },
    "includedAccountIdParam": {
      "name": "included_account_id",
      "in": "query",
      "description": "Account IDs in the match (array)",
      "required": false,
      "type": "integer"
    },
    "excludedAccountIdParam": {
      "name": "excluded_account_id",
      "in": "query",
      "description": "Account IDs not in the match (array)",
      "required": false,
      "type": "integer"
    },
    "significantParam": {
      "name": "significant",
      "in": "query",
      "description": "Whether the match was significant for aggregation purposes",
      "required": false,
      "type": "integer"
    },
    "sortParam": {
      "name": "sort",
      "in": "query",
      "description": "The field to return matches sorted by in descending order",
      "required": false,
      "type": "string"
    }
  },
  "paths": {
    "/matches/{match_id}": {
      "get": {
        "summary": "/",
        "description": "Match data",
        "tags": [
          "matches"
        ],
        "parameters": [{
          "name": "match_id",
          "in": "path",
          "required": true,
          "type": "integer"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "match_id": {
                  "description": "match_id",
                  "type": "number"
                },
                "cluster": {
                  "description": "cluster",
                  "type": "number"
                },
                "replay_salt": {
                  "description": "replay_salt",
                  "type": "number"
                },
                "series_id": {
                  "description": "series_id",
                  "type": "number"
                },
                "series_type": {
                  "description": "series_type",
                  "type": "number"
                },
                "parties": {
                  "description": "parties",
                  "type": "object"
                },
                "skill": {
                  "description": "skill",
                  "type": "number"
                },
                "players": {
                  "description": "players",
                  "type": "object"
                },
                "barracks_status_dire": {
                  "description": "barracks_status_dire",
                  "type": "number"
                },
                "barracks_status_radiant": {
                  "description": "barracks_status_radiant",
                  "type": "number"
                },
                "chat": {
                  "description": "chat",
                  "type": "object"
                },
                "duration": {
                  "description": "duration",
                  "type": "number"
                },
                "engine": {
                  "description": "engine",
                  "type": "number"
                },
                "first_blood_time": {
                  "description": "first_blood_time",
                  "type": "number"
                },
                "game_mode": {
                  "description": "game_mode",
                  "type": "number"
                },
                "human_players": {
                  "description": "human_players",
                  "type": "number"
                },
                "leagueid": {
                  "description": "leagueid",
                  "type": "number"
                },
                "lobby_type": {
                  "description": "lobby_type",
                  "type": "number"
                },
                "match_seq_num": {
                  "description": "match_seq_num",
                  "type": "number"
                },
                "negative_votes": {
                  "description": "negative_votes",
                  "type": "number"
                },
                "objectives": {
                  "description": "objectives",
                  "type": "object"
                },
                "picks_bans": {
                  "description": "picks_bans",
                  "type": "object"
                },
                "positive_votes": {
                  "description": "positive_votes",
                  "type": "number"
                },
                "radiant_gold_adv": {
                  "description": "radiant_gold_adv",
                  "type": "object"
                },
                "radiant_win": {
                  "description": "radiant_win",
                  "type": "boolean"
                },
                "radiant_xp_adv": {
                  "description": "radiant_xp_adv",
                  "type": "object"
                },
                "start_time": {
                  "description": "start_time",
                  "type": "number"
                },
                "teamfights": {
                  "description": "teamfights",
                  "type": "object"
                },
                "tower_status_dire": {
                  "description": "tower_status_dire",
                  "type": "number"
                },
                "tower_status_radiant": {
                  "description": "tower_status_radiant",
                  "type": "number"
                },
                "version": {
                  "description": "version",
                  "type": "number"
                },
                "patch": {
                  "description": "patch",
                  "type": "number"
                },
                "region": {
                  "description": "region",
                  "type": "number"
                },
                "all_word_counts": {
                  "description": "all_word_counts",
                  "type": "object"
                },
                "my_word_counts": {
                  "description": "my_word_counts",
                  "type": "object"
                },
                "throw": {
                  "description": "throw",
                  "type": "number"
                },
                "loss": {
                  "description": "loss",
                  "type": "number"
                },
                "replay_url": {
                  "description": "replay_url",
                  "type": "string"
                }
              }
            }
          }
        },
        route: () => '/matches/:match_id/:info?',
        func: (req, res, cb) => {
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
        },
      }
    },
    "/players/{account_id}": {
      "get": {
        "summary": "/",
        "description": "Player data",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "tracked_until": {
                  "description": "tracked_until",
                  "type": "string"
                },
                "solo_competitive_rank": {
                  "description": "solo_competitive_rank",
                  "type": "string"
                },
                "competitive_rank": {
                  "description": "competitive_rank",
                  "type": "string"
                },
                "mmr_estimate": {
                  "description": "mmr_estimate",
                  "type": "object"
                },
                "profile": {
                  "description": "profile",
                  "type": "object"
                }
              }
            }
          }
        },
        route: () => '/players/:account_id',
        func: (req, res, cb) => {
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
        },
      }
    },
    "/players/{account_id}/wl": {
      "get": {
        "summary": "/wl",
        "description": "Win/Loss count",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "win": {
                  "description": "win",
                  "type": "number"
                },
                "lose": {
                  "description": "lose",
                  "type": "number"
                }
              }
            }
          }
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
            res.json(result);
          });
        },
      }
    },
    "/players/{account_id}/matches": {
      "get": {
        "summary": "/matches",
        "description": "Matches played",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/projectParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/players/:account_id/matches',
        func: (req, res, cb) => {
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
        },
      }
    },
    "/players/{account_id}/heroes": {
      "get": {
        "summary": "/heroes",
        "description": "Heroes played",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/players/:account_id/heroes',
        func: (req, res, cb) => {
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
        },
      }
    },
    "/players/{account_id}/peers": {
      "get": {
        "summary": "/peers",
        "description": "Players played with",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/players/:account_id/peers',
        func: (req, res, cb) => {
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
        },
      }
    },
    "/players/{account_id}/pros": {
      "get": {
        "summary": "/pros",
        "description": "Pro players played with",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/players/:account_id/pros',
        func: (req, res, cb) => {
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
        },
      }
    },
    "/players/{account_id}/records": {
      "get": {
        "summary": "/records",
        "description": "Extremes in matches played",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "kills": {
                  "description": "kills",
                  "type": "object"
                },
                "deaths": {
                  "description": "deaths",
                  "type": "object"
                },
                "assists": {
                  "description": "assists",
                  "type": "object"
                },
                "kda": {
                  "description": "kda",
                  "type": "object"
                },
                "gold_per_min": {
                  "description": "gold_per_min",
                  "type": "object"
                },
                "xp_per_min": {
                  "description": "xp_per_min",
                  "type": "object"
                },
                "last_hits": {
                  "description": "last_hits",
                  "type": "object"
                },
                "denies": {
                  "description": "denies",
                  "type": "object"
                },
                "lane_efficiency_pct": {
                  "description": "lane_efficiency_pct",
                  "type": "object"
                },
                "duration": {
                  "description": "duration",
                  "type": "object"
                },
                "level": {
                  "description": "level",
                  "type": "object"
                },
                "hero_damage": {
                  "description": "hero_damage",
                  "type": "object"
                },
                "tower_damage": {
                  "description": "tower_damage",
                  "type": "object"
                },
                "hero_healing": {
                  "description": "hero_healing",
                  "type": "object"
                },
                "stuns": {
                  "description": "stuns",
                  "type": "object"
                },
                "tower_kills": {
                  "description": "tower_kills",
                  "type": "object"
                },
                "neutral_kills": {
                  "description": "neutral_kills",
                  "type": "object"
                },
                "courier_kills": {
                  "description": "courier_kills",
                  "type": "object"
                },
                "purchase_tpscroll": {
                  "description": "purchase_tpscroll",
                  "type": "object"
                },
                "purchase_ward_observer": {
                  "description": "purchase_ward_observer",
                  "type": "object"
                },
                "purchase_ward_sentry": {
                  "description": "purchase_ward_sentry",
                  "type": "object"
                },
                "purchase_gem": {
                  "description": "purchase_gem",
                  "type": "object"
                },
                "purchase_rapier": {
                  "description": "purchase_rapier",
                  "type": "object"
                },
                "pings": {
                  "description": "pings",
                  "type": "object"
                },
                "throw": {
                  "description": "throw",
                  "type": "object"
                },
                "comeback": {
                  "description": "comeback",
                  "type": "object"
                },
                "stomp": {
                  "description": "stomp",
                  "type": "object"
                },
                "loss": {
                  "description": "loss",
                  "type": "object"
                },
                "actions_per_min": {
                  "description": "actions_per_min",
                  "type": "object"
                }
              }
            }
          }
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
              for (const key in subkeys) {
                if (!result[key] || (m[key] > result[key][key])) {
                  result[key] = m;
                }
              }
            });
            res.json(result);
          });
        },
      }
    },
    "/players/{account_id}/counts": {
      "get": {
        "summary": "/counts",
        "description": "Categorical counts",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "leaver_status": {
                  "description": "leaver_status",
                  "type": "object"
                },
                "game_mode": {
                  "description": "game_mode",
                  "type": "object"
                },
                "lobby_type": {
                  "description": "lobby_type",
                  "type": "object"
                },
                "lane_role": {
                  "description": "lane_role",
                  "type": "object"
                },
                "region": {
                  "description": "region",
                  "type": "object"
                },
                "patch": {
                  "description": "patch",
                  "type": "object"
                }
              }
            }
          }
        },
        route: () => '/players/:account_id/counts',
        func: (req, res, cb) => {
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
                result[key][~~m[key]].win += (m.radiant_win === utility.isRadiant(m)) ? 1 : 0;
              }
            });
            res.json(result);
          });
        },
      }
    },
    "/players/{account_id}/histograms/{field}": {
      "get": {
        "summary": "/histograms",
        "description": "Distribution of matches in a single stat",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/fieldParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
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
            res.json(bucketArray);
          });
        },
      }
    },
    "/players/{account_id}/wardmap": {
      "get": {
        "summary": "/wardmap",
        "description": "Wards placed in matches played",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "obs": {
                  "description": "obs",
                  "type": "object"
                },
                "sen": {
                  "description": "sen",
                  "type": "object"
                }
              }
            }
          }
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
        },
      }
    },
    "/players/{account_id}/wordcloud": {
      "get": {
        "summary": "/wordcloud",
        "description": "Words said/read in matches played",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }, {
          "$ref": "#/parameters/limitParam"
        }, {
          "$ref": "#/parameters/offsetParam"
        }, {
          "$ref": "#/parameters/winParam"
        }, {
          "$ref": "#/parameters/patchParam"
        }, {
          "$ref": "#/parameters/gameModeParam"
        }, {
          "$ref": "#/parameters/lobbyTypeParam"
        }, {
          "$ref": "#/parameters/regionParam"
        }, {
          "$ref": "#/parameters/dateParam"
        }, {
          "$ref": "#/parameters/laneRoleParam"
        }, {
          "$ref": "#/parameters/heroIdParam"
        }, {
          "$ref": "#/parameters/isRadiantParam"
        }, {
          "$ref": "#/parameters/includedAccountIdParam"
        }, {
          "$ref": "#/parameters/excludedAccountIdParam"
        }, {
          "$ref": "#/parameters/withHeroIdParam"
        }, {
          "$ref": "#/parameters/againstHeroIdParam"
        }, {
          "$ref": "#/parameters/significantParam"
        }, {
          "$ref": "#/parameters/sortParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "my_word_counts": {
                  "description": "my_word_counts",
                  "type": "object"
                },
                "all_word_counts": {
                  "description": "all_word_counts",
                  "type": "object"
                }
              }
            }
          }
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
              for (const key in result) {
                utility.mergeObjects(result[key], m[key]);
              }
            });
            res.json(result);
          });
        },
      }
    },
    "/players/{account_id}/ratings": {
      "get": {
        "summary": "/ratings",
        "description": "Player rating history",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/players/:account_id/ratings',
        func: (req, res, cb) => {
          queries.getPlayerRatings(db, req.params.account_id, (err, result) => {
            if (err) {
              return cb(err);
            }
            res.json(result);
          });
        },
      }
    },
    "/players/{account_id}/rankings": {
      "get": {
        "summary": "/rankings",
        "description": "Player hero rankings",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/players/:account_id/rankings',
        func: (req, res, cb) => {
          queries.getPlayerRankings(redis, req.params.account_id, (err, result) => {
            if (err) {
              return cb(err);
            }
            res.json(result);
          });
        },
      }
    },
    "/players/{account_id}/refresh": {
      post: {
        "summary": "/refresh",
        "description": "Refresh player match history",
        "tags": [
          "players"
        ],
        "parameters": [{
          "$ref": "#/parameters/accountIdParam"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
            }
          }
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
      }
    },
    "/explorer": {
      "get": {
        "summary": "/",
        "description": "Submit arbitrary SQL queries to the database",
        tags: ["explorer"],
        "parameters": [{
          "name": "sql",
          "in": "query",
          "description": "The PostgreSQL query as percent-encoded string.",
          "required": false,
          "type": "string"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
            }
          }
        },
        route: () => '/explorer',
        func: (req, res, cb) => {
          // TODO handle NQL (@nicholashh query language)
          const input = req.query.sql;
          return queryRaw(input, (err, result) => {
            if (err) {
              console.error(err);
            }
            const final = Object.assign({}, result, {
              err: err ? err.stack : err,
            });
            res.status(err ? 400 : 200).json(final);
          });
        },

      }
    },
    "/metadata": {
      "get": {
        "summary": "/",
        "description": "Site metadata",
        "tags": [
          "metadata"
        ],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "banner": {
                  "description": "banner",
                  "type": "object"
                },
                "cheese": {
                  "description": "cheese",
                  "type": "object"
                }
              }
            }
          }
        },
        route: () => "/metadata",
        func: (req, res, cb) => {
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
        },
      }
    },
    "/distributions": {
      "get": {
        "summary": "/",
        "description": "Global Dota 2 statistics",
        "tags": [
          "distributions"
        ],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "mmr": {
                  "description": "mmr",
                  "type": "object"
                },
                "country_mmr": {
                  "description": "country_mmr",
                  "type": "object"
                }
              }
            }
          }
        },
        route: () => '/distributions',
        func: (req, res, cb) => {
          queries.getDistributions(redis, (err, result) => {
            if (err) {
              return cb(err);
            }
            res.json(result);
          });
        },
      }
    },
    "/search": {
      "get": {
        "summary": "/",
        "description": "Search players by personaname",
        "tags": [
          "search"
        ],
        "parameters": [{
          "name": "q",
          "in": "query",
          "description": "Search string",
          "required": true,
          "type": "string"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/search',
        func: (req, res, cb) => {
          if (!req.query.q) {
            return res.status(400).json([]);
          }
          search(db, req.query.q, (err, result) => {
            if (err) {
              return cb(err);
            }
            res.json(result);
          });
        },
      }
    },
    "/rankings": {
      "get": {
        "summary": "/",
        "description": "Top players by hero",
        "tags": [
          "rankings"
        ],
        "parameters": [{
          "name": "hero_id",
          "in": "query",
          "description": "Hero ID",
          "required": true,
          "type": "string"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "hero_id": {
                  "description": "hero_id",
                  "type": "number"
                },
                "rankings": {
                  "description": "rankings",
                  "type": "object"
                }
              }
            }
          }
        },
        route: () => '/rankings',
        func: (req, res, cb) => {
          queries.getHeroRankings(db, redis, req.query.hero_id, {}, (err, result) => {
            if (err) {
              return cb(err);
            }
            res.json(result);
          });
        },
      }
    },
    "/benchmarks": {
      "get": {
        "summary": "/",
        "description": "Benchmarks of average stat values for a hero",
        "tags": [
          "benchmarks"
        ],
        "parameters": [{
          "name": "hero_id",
          "in": "query",
          "description": "Hero ID",
          "required": true,
          "type": "string"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
              "properties": {
                "hero_id": {
                  "description": "hero_id",
                  "type": "number"
                },
                "result": {
                  "description": "result",
                  "type": "object"
                }
              }
            }
          }
        },
        route: () => '/benchmarks',
        func: (req, res, cb) => {
          queries.getHeroBenchmarks(db, redis, {
            hero_id: req.query.hero_id,
          }, (err, result) => {
            if (err) {
              return cb(err);
            }
            res.json(result);
          });
        },
      }
    },
    "/status": {
      get: {
        "summary": "/",
        "description": "Get current service statistics",
        tags: ['status'],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object"
            }
          }
        },
        route: () => '/status',
        func: (req, res, cb) => {
          buildStatus(db, redis, (err, status) => {
            if (err) {
              return cb(err);
            }
            res.json(status);
          });
        },
      }
    },
    "/health": {
      get: {
        "summary": "/",
        "description": "Get service health data",
        tags: ["health"],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object"
            }
          }
        },
        route: () => '/health/:metric?',
        func: (req, res, cb) => {
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
        },
      },
    },
    "/request": {
      get: {
        "summary": "GET",
        description: "Get parse request state",
        tags: ['request'],
        "parameters": [{
          "name": "id",
          "in": "query",
          "description": "The job ID to query.",
          "required": true,
          "type": "string"
        }],
        route: () => '/request',
        func: (req, res, cb) => {
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
        },
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object"
            }
          }
        }
      },
    },
    "/request/{match_id}": {
      post: {
        summary: "POST",
        description: "Submit a new parse request",
        tags: ['request'],
        route: () => '/request/:match_id',
        func: (req, res, cb) => {
          const match_id = req.params.match_id;
          const match = {
            match_id: Number(match_id),
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
              error: err,
              job: {
                jobId: parseJob && parseJob.jobId,
              },
            });
          }

          if (match && match.match_id) {
            // match id request, get data from API
            utility.getData(utility.generateJob('api_details', match).url, (err, body) => {
              if (err) {
                // couldn't get data from api, non-retryable
                return cb(JSON.stringify(err));
              }
              // match details response
              const match = body.result;
              redis.zadd('requests', moment().format('X'), `${moment().format('X')}_${match.match_id}`);
              queries.insertMatch(match, {
                type: 'api',
                attempts: 1,
                lifo: true,
                cassandra,
                forceParse: true,
              }, exitWithJob);
            });
          } else {
            return exitWithJob('invalid input');
          }
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
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object",
            }
          }
        }
      },
    },
    "/matchups": {
      get: {
        summary: "/",
        description: "Get hero matchups (teammates and opponents)",
        tags: ['matchups'],
        "parameters": [{
          "name": "t0",
          "in": "query",
          "description": "Hero 0 ID",
          "required": false,
          "type": "number"
        }, {
          "name": "t1",
          "in": "query",
          "description": "Hero 1 ID",
          "required": false,
          "type": "number"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "object"
            }
          }
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
            res.json({
              t0: Number(result.t0) || 0,
              t1: Number(result.t1) || 0,
            });
          });
        },
      }
    },
    "/heroes": {
      get: {
        summary: '/',
        description: "Get hero data",
        tags: ['heroes'],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/heroes',
        func: (req, res, cb) => {
          db.select().from('heroes').orderBy('id', 'asc').asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        }
      },
    },
    "/leagues": {
      get: {
        summary: "/",
        description: "Get league data",
        tags: ['leagues'],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/leagues',
        func: (req, res, cb) => {
          db.select().from('leagues').asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        }
      },
    },
    "/replays": {
      get: {
        summary: '/',
        description: "Get replay data",
        tags: ['replays'],
        "parameters": [{
          "name": "match_id",
          "in": "query",
          "description": "Match IDs (array)",
          "required": true,
          "type": "integer"
        }],
        "responses": {
          "200": {
            "description": "Success",
            "schema": {
              "type": "array",
              items: {
                "type": "object",
              },
            }
          }
        },
        route: () => '/replays',
        func: (req, res, cb) => {
          db.select(['match_id', 'cluster', 'replay_salt']).from('match_gcdata').whereIn('match_id', (req.query.match_id || []).slice(0, 100)).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(result);
          });
        }
      },
    },
  },
};
module.exports = spec;
