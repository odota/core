const async = require('async');
const constants = require('dotaconstants');
const config = require('../config');
// const crypto = require('crypto');
const moment = require('moment');
const uuidV4 = require('uuid/v4');
const queue = require('../store/queue');
const queries = require('../store/queries');
const search = require('../store/search');
const buildMatch = require('../store/buildMatch');
const buildStatus = require('../store/buildStatus');
const queryRaw = require('../store/queryRaw');
const playerFields = require('./playerFields');
const getGcData = require('../util/getGcData');
const utility = require('../util/utility');
const db = require('../store/db');
const redis = require('../store/redis');
const cassandra = require('../store/cassandra');
const packageJson = require('../package.json');
const cacheFunctions = require('../store/cacheFunctions');

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
  mmrAscendingParam: {
    name: 'mmr_ascending',
    in: 'query',
    description: 'Order by MMR ascending',
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

function sendDataWithCache(req, res, data, key) {
  if (req.originalQuery && !Object.keys(req.originalQuery).length) {
    cacheFunctions.write({
      key,
      account_id: req.params.account_id,
    }, JSON.stringify(data), () => {});
  }
  return res.json(data);
}

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
        summary: 'GET /matches/{match_id}',
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
                cluster: {
                  description: 'cluster',
                  type: 'number',
                },
                cosmetics: {
                  description: 'cosmetics',
                  type: 'object',
                },
                dire_score: {
                  description: 'dire_score',
                  type: 'number',
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
                radiant_score: {
                  description: 'radiant_score',
                  type: 'number',
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
                radiant_team: {
                  description: 'radiant_team',
                  type: 'object',
                },
                dire_team: {
                  description: 'dire_team',
                  type: 'object',
                },
                league: {
                  description: 'league',
                  type: 'object',
                },
                skill: {
                  description: 'skill',
                  type: 'number',
                },
                players: {
                  description: 'players',
                  type: 'array',
                  items: {
                    description: 'player',
                    type: 'object',
                    properties: {
                      match_id: {
                        description: 'match_id',
                        type: 'number',
                      },
                      player_slot: {
                        description: 'player_slot',
                        type: 'number',
                      },
                      ability_upgrades_arr: {
                        description: 'ability_upgrades_arr',
                        type: 'array',
                      },
                      ability_uses: {
                        description: 'ability_uses',
                        type: 'object',
                      },
                      account_id: {
                        description: 'account_id',
                        type: 'number',
                      },
                      actions: {
                        description: 'actions',
                        type: 'object',
                      },
                      additional_units: {
                        description: 'additional_units',
                        type: 'object',
                      },
                      assists: {
                        description: 'assists',
                        type: 'number',
                      },
                      backpack_0: {
                        description: 'backpack_0',
                        type: 'number',
                      },
                      backpack_1: {
                        description: 'backpack_1',
                        type: 'number',
                      },
                      backpack_2: {
                        description: 'backpack_2',
                        type: 'number',
                      },
                      buyback_log: {
                        description: 'buyback_log',
                        type: 'array',
                      },
                      camps_stacked: {
                        description: 'camps_stacked',
                        type: 'number',
                      },
                      creeps_stacked: {
                        description: 'creeps_stacked',
                        type: 'number',
                      },
                      damage: {
                        description: 'damage',
                        type: 'object',
                      },
                      damage_inflictor: {
                        description: 'damage_inflictor',
                        type: 'object',
                      },
                      damage_inflictor_received: {
                        description: 'damage_inflictor_received',
                        type: 'object',
                      },
                      damage_taken: {
                        description: 'damage_taken',
                        type: 'object',
                      },
                      deaths: {
                        description: 'deaths',
                        type: 'number',
                      },
                      denies: {
                        description: 'denies',
                        type: 'number',
                      },
                      dn_t: {
                        description: 'dn_t',
                        type: 'array',
                      },
                      gold: {
                        description: 'gold',
                        type: 'number',
                      },
                      gold_per_min: {
                        description: 'gold_per_min',
                        type: 'number',
                      },
                      gold_reasons: {
                        description: 'gold_reasons',
                        type: 'object',
                      },
                      gold_spent: {
                        description: 'gold_spent',
                        type: 'number',
                      },
                      gold_t: {
                        description: 'gold_t',
                        type: 'array',
                      },
                      hero_damage: {
                        description: 'hero_damage',
                        type: 'number',
                      },
                      hero_healing: {
                        description: 'hero_healing',
                        type: 'number',
                      },
                      hero_hits: {
                        description: 'hero_hits',
                        type: 'object',
                      },
                      hero_id: {
                        description: 'hero_id',
                        type: 'number',
                      },
                      item_0: {
                        description: 'item_0',
                        type: 'number',
                      },
                      item_1: {
                        description: 'item_1',
                        type: 'number',
                      },
                      item_2: {
                        description: 'item_2',
                        type: 'number',
                      },
                      item_3: {
                        description: 'item_3',
                        type: 'number',
                      },
                      item_4: {
                        description: 'item_4',
                        type: 'number',
                      },
                      item_5: {
                        description: 'item_5',
                        type: 'number',
                      },
                      item_uses: {
                        description: 'item_uses',
                        type: 'object',
                      },
                      kill_streaks: {
                        description: 'kill_streaks',
                        type: 'object',
                      },
                      killed: {
                        description: 'killed',
                        type: 'object',
                      },
                      killed_by: {
                        description: 'killed_by',
                        type: 'object',
                      },
                      kills: {
                        description: 'kills',
                        type: 'number',
                      },
                      kills_log: {
                        description: 'kills_log',
                        type: 'array',
                      },
                      lane_pos: {
                        description: 'lane_pos',
                        type: 'object',
                      },
                      last_hits: {
                        description: 'last_hits',
                        type: 'number',
                      },
                      leaver_status: {
                        description: 'leaver_status',
                        type: 'number',
                      },
                      level: {
                        description: 'level',
                        type: 'number',
                      },
                      lh_t: {
                        description: 'lh_t',
                        type: 'array',
                      },
                      life_state: {
                        description: 'life_state',
                        type: 'object',
                      },
                      max_hero_hit: {
                        description: 'max_hero_hit',
                        type: 'object',
                      },
                      multi_kills: {
                        description: 'multi_kills',
                        type: 'object',
                      },
                      obs: {
                        description: 'obs',
                        type: 'object',
                      },
                      obs_left_log: {
                        description: 'obs_left_log',
                        type: 'array',
                      },
                      obs_log: {
                        description: 'obs_log',
                        type: 'array',
                      },
                      obs_placed: {
                        description: 'obs_placed',
                        type: 'number',
                      },
                      party_id: {
                        description: 'party_id',
                        type: 'number',
                      },
                      permanent_buffs: {
                        description: 'permanent_buffs',
                        type: 'array',
                      },
                      pings: {
                        description: 'pings',
                        type: 'number',
                      },
                      purchase: {
                        description: 'purchase',
                        type: 'object',
                      },
                      purchase_log: {
                        description: 'purchase_log',
                        type: 'array',
                      },
                      rune_pickups: {
                        description: 'rune_pickups',
                        type: 'number',
                      },
                      runes: {
                        description: 'runes',
                        type: 'object',
                      },
                      runes_log: {
                        description: 'runes_log',
                        type: 'array',
                      },
                      sen: {
                        description: 'sen',
                        type: 'object',
                      },
                      sen_left_log: {
                        description: 'sen_left_log',
                        type: 'array',
                      },
                      sen_log: {
                        description: 'sen_log',
                        type: 'array',
                      },
                      sen_placed: {
                        description: 'sen_placed',
                        type: 'number',
                      },
                      stuns: {
                        description: 'stuns',
                        type: 'number',
                      },
                      times: {
                        description: 'times',
                        type: 'array',
                      },
                      tower_damage: {
                        description: 'tower_damage',
                        type: 'number',
                      },
                      xp_per_min: {
                        description: 'xp_per_min',
                        type: 'number',
                      },
                      xp_reasons: {
                        description: 'xp_reasons',
                        type: 'object',
                      },
                      xp_t: {
                        description: 'xp_t',
                        type: 'array',
                      },
                      personaname: {
                        description: 'personaname',
                        type: 'string',
                      },
                      name: {
                        description: 'name',
                        type: 'string',
                      },
                      last_login: {
                        description: 'last_login',
                        type: 'dateTime',
                      },
                      radiant_win: {
                        description: 'radiant_win',
                        type: 'boolean',
                      },
                      start_time: {
                        description: 'start_time',
                        type: 'number',
                      },
                      duration: {
                        description: 'duration',
                        type: 'number',
                      },
                      cluster: {
                        description: 'cluster',
                        type: 'number',
                      },
                      lobby_type: {
                        description: 'lobby_type',
                        type: 'number',
                      },
                      game_mode: {
                        description: 'game_mode',
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
                      isRadiant: {
                        description: 'isRadiant',
                        type: 'boolean',
                      },
                      win: {
                        description: 'win',
                        type: 'number',
                      },
                      lose: {
                        description: 'win',
                        type: 'number',
                      },
                      total_gold: {
                        description: 'total_gold',
                        type: 'number',
                      },
                      total_xp: {
                        description: 'total_xp',
                        type: 'number',
                      },
                      kills_per_min: {
                        description: 'kills_per_min',
                        type: 'number',
                      },
                      kda: {
                        description: 'kda',
                        type: 'number',
                      },
                      abandons: {
                        description: 'abandons',
                        type: 'number',
                      },
                      neutral_kills: {
                        description: 'neutral_kills',
                        type: 'number',
                      },
                      tower_kills: {
                        description: 'tower_kills',
                        type: 'number',
                      },
                      courier_kills: {
                        description: 'courier_kills',
                        type: 'number',
                      },
                      lane_kills: {
                        description: 'lane_kills',
                        type: 'number',
                      },
                      hero_kills: {
                        description: 'hero_kills',
                        type: 'number',
                      },
                      observer_kills: {
                        description: 'observer_kills',
                        type: 'number',
                      },
                      sentry_kills: {
                        description: 'sentry_kills',
                        type: 'number',
                      },
                      roshan_kills: {
                        description: 'roshan_kills',
                        type: 'number',
                      },
                      necronomicon_kills: {
                        description: 'necronomicon_kills',
                        type: 'number',
                      },
                      ancient_kills: {
                        description: 'ancient_kills',
                        type: 'number',
                      },
                      buyback_count: {
                        description: 'buyback_count',
                        type: 'number',
                      },
                      observer_uses: {
                        description: 'observer_uses',
                        type: 'number',
                      },
                      sentry_uses: {
                        description: 'sentry_uses',
                        type: 'number',
                      },
                      lane_efficiency: {
                        description: 'lane_efficiency',
                        type: 'number',
                      },
                      lane_efficiency_pct: {
                        description: 'lane_efficiency_pct',
                        type: 'number',
                      },
                      lane: {
                        description: 'lane',
                        type: 'number',
                      },
                      lane_role: {
                        description: 'lane_role',
                        type: 'number',
                      },
                      is_roaming: {
                        description: 'is_roaming',
                        type: 'boolean',
                      },
                      purchase_time: {
                        description: 'purchase_time',
                        type: 'object',
                      },
                      first_purchase_time: {
                        description: 'first_purchase_time',
                        type: 'object',
                      },
                      item_win: {
                        description: 'item_win',
                        type: 'object',
                      },
                      item_usage: {
                        description: 'item_usage',
                        type: 'object',
                      },
                      purchase_tpscroll: {
                        description: 'purchase_tpscroll',
                        type: 'object',
                      },
                      actions_per_min: {
                        description: 'actions_per_min',
                        type: 'number',
                      },
                      life_state_dead: {
                        description: 'life_state_dead',
                        type: 'number',
                      },
                      solo_competitive_rank: {
                        description: 'solo_competitive_rank',
                        type: 'string',
                      },
                      cosmetics: {
                        description: 'cosmetics',
                        type: 'array',
                      },
                      benchmarks: {
                        description: 'benchmarks',
                        type: 'object',
                      },
                    },
                  },
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
        summary: 'GET /players/{account_id}',
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
                  properties: {
                    estimate: {
                      description: 'estimate',
                      type: 'number',
                    },
                    stdDev: {
                      description: 'stdDev',
                      type: 'number',
                    },
                    n: {
                      description: 'n',
                      type: 'number',
                    },
                  },
                },
                profile: {
                  description: 'profile',
                  type: 'object',
                  properties: {
                    account_id: {
                      description: 'account_id',
                      type: 'number',
                    },
                    personaname: {
                      description: 'personaname',
                      type: 'string',
                    },
                    name: {
                      description: 'name',
                      type: 'string',
                    },
                    cheese: {
                      description: 'cheese',
                      type: 'number',
                    },
                    steamid: {
                      description: 'steamid',
                      type: 'string',
                    },
                    avatar: {
                      description: 'avatar',
                      type: 'string',
                    },
                    avatarmedium: {
                      description: 'avatarmedium',
                      type: 'string',
                    },
                    avatarfull: {
                      description: 'avatarfull',
                      type: 'string',
                    },
                    profileurl: {
                      description: 'profileurl',
                      type: 'string',
                    },
                    last_login: {
                      description: 'last_login',
                      type: 'string',
                    },
                    loccountrycode: {
                      description: 'loccountrycode',
                      type: 'string',
                    },
                  },
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
        summary: 'GET /players/{account_id}/wl',
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
            return sendDataWithCache(req, res, result, 'wl');
          });
        },
      },
    },
    '/players/{account_id}/recentMatches': {
      get: {
        summary: 'GET /players/{account_id}/recentMatches',
        description: 'Recent matches played',
        tags: [
          'players',
        ],
        parameters: [],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                description: 'match',
                type: 'object',
                properties: {
                  match_id: {
                    description: 'match_id',
                    type: 'number',
                  },
                  player_slot: {
                    description: 'player_slot',
                    type: 'number',
                  },
                  radiant_win: {
                    description: 'radiant_win',
                    type: 'boolean',
                  },
                  duration: {
                    description: 'duration',
                    type: 'number',
                  },
                  game_mode: {
                    description: 'game_mode',
                    type: 'number',
                  },
                  lobby_type: {
                    description: 'lobby_type',
                    type: 'number',
                  },
                  hero_id: {
                    description: 'hero_id',
                    type: 'number',
                  },
                  start_time: {
                    description: 'start_time',
                    type: 'number',
                  },
                  version: {
                    description: 'version',
                    type: 'number',
                  },
                  kills: {
                    description: 'kills',
                    type: 'number',
                  },
                  deaths: {
                    description: 'deaths',
                    type: 'number',
                  },
                  assists: {
                    description: 'assists',
                    type: 'number',
                  },
                  skill: {
                    description: 'skill',
                    type: 'number',
                  },
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/recentMatches',
        func: (req, res, cb) => {
          queries.getPlayerMatches(req.params.account_id, {
            project: req.queryObj.project.concat(
              ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'game_mode', 'lobby_type', 'version', 'kills', 'deaths', 'assists', 'skill', 'xp_per_min', 'gold_per_min', 'hero_damage', 'tower_damage', 'hero_healing', 'last_hits']
            ),
            dbLimit: 20,
          }, (err, cache) => {
            if (err) {
              return cb(err);
            }
            return res.json(cache);
          });
        },
      },
    },
    '/players/{account_id}/matches': {
      get: {
        summary: 'GET /players/{account_id}/matches',
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
                description: 'match',
                type: 'object',
                properties: {
                  match_id: {
                    description: 'match_id',
                    type: 'number',
                  },
                  player_slot: {
                    description: 'player_slot',
                    type: 'number',
                  },
                  radiant_win: {
                    description: 'radiant_win',
                    type: 'boolean',
                  },
                  duration: {
                    description: 'duration',
                    type: 'number',
                  },
                  game_mode: {
                    description: 'game_mode',
                    type: 'number',
                  },
                  lobby_type: {
                    description: 'lobby_type',
                    type: 'number',
                  },
                  hero_id: {
                    description: 'hero_id',
                    type: 'number',
                  },
                  start_time: {
                    description: 'start_time',
                    type: 'number',
                  },
                  version: {
                    description: 'version',
                    type: 'number',
                  },
                  kills: {
                    description: 'kills',
                    type: 'number',
                  },
                  deaths: {
                    description: 'deaths',
                    type: 'number',
                  },
                  assists: {
                    description: 'assists',
                    type: 'number',
                  },
                  skill: {
                    description: 'skill',
                    type: 'number',
                  },
                  heroes: {
                    description: 'heroes (requires ?project=heroes)',
                    type: 'object',
                    properties: {
                      player_slot: {
                        description: 'player_slot',
                        type: 'object',
                        properties: {
                          account_id: {
                            description: 'account_id',
                            type: 'number',
                          },
                          hero_id: {
                            description: 'hero_id',
                            type: 'number',
                          },
                          player_slot: {
                            description: 'player_slot',
                            type: 'number',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/matches',
        func: (req, res, cb) => {
          // Use passed fields as additional fields, if available
          const additionalFields = req.query.project || ['hero_id', 'start_time', 'duration', 'player_slot', 'radiant_win', 'game_mode', 'lobby_type', 'version', 'kills', 'deaths', 'assists', 'skill'];
          req.queryObj.project = req.queryObj.project.concat(additionalFields);
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            return res.json(cache);
          });
        },
      },
    },
    '/players/{account_id}/heroes': {
      get: {
        summary: 'GET /players/{account_id}/heroes',
        description: 'Heroes played',
        tags: ['players'],
        parameters: playerParams,
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                description: 'hero',
                type: 'object',
                properties: {
                  hero_id: {
                    description: 'hero_id',
                    type: 'string',
                  },
                  last_played: {
                    description: 'last_played',
                    type: 'number',
                  },
                  games: {
                    description: 'games',
                    type: 'number',
                  },
                  win: {
                    description: 'win',
                    type: 'number',
                  },
                  with_games: {
                    description: 'with_games',
                    type: 'number',
                  },
                  with_win: {
                    description: 'with_win',
                    type: 'number',
                  },
                  against_games: {
                    description: 'against_games',
                    type: 'number',
                  },
                  against_win: {
                    description: 'against_win',
                    type: 'number',
                  },
                },
              },
            },
          },
        },
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
            const result = Object.keys(heroes)
              .map(k => heroes[k])
              .sort((a, b) => b.games - a.games);
            return sendDataWithCache(req, res, result, 'heroes');
          });
        },
      },
    },
    '/players/{account_id}/peers': {
      get: {
        summary: 'GET /players/{account_id}/peers',
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
                properties: {
                  account_id: {
                    description: 'account_id',
                    type: 'number',
                  },
                  last_played: {
                    description: 'last_played',
                    type: 'number',
                  },
                  win: {
                    description: 'win',
                    type: 'number',
                  },
                  games: {
                    description: 'games',
                    type: 'number',
                  },
                  with_win: {
                    description: 'with_win',
                    type: 'number',
                  },
                  with_games: {
                    description: 'with_games',
                    type: 'number',
                  },
                  against_win: {
                    description: 'against_win',
                    type: 'number',
                  },
                  against_games: {
                    description: 'against_games',
                    type: 'number',
                  },
                  with_gpm_sum: {
                    description: 'with_gpm_sum',
                    type: 'number',
                  },
                  with_xpm_sum: {
                    description: 'with_xpm_sum',
                    type: 'number',
                  },
                  personaname: {
                    description: 'personaname',
                    type: 'string',
                  },
                  last_login: {
                    description: 'last_login',
                    type: 'string',
                  },
                  avatar: {
                    description: 'avatar',
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/peers',
        func: (req, res, cb) => {
          req.queryObj.project = req.queryObj.project.concat('heroes', 'start_time', 'player_slot', 'radiant_win', 'gold_per_min', 'xp_per_min');
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
              return sendDataWithCache(req, res, result, 'peers');
            });
          });
        },
      },
    },
    '/players/{account_id}/pros': {
      get: {
        summary: 'GET /players/{account_id}/pros',
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
                properties: {
                  account_id: {
                    description: 'account_id',
                    type: 'number',
                  },
                  name: {
                    description: 'name',
                    type: 'string',
                  },
                  country_code: {
                    description: 'country_code',
                    type: 'string',
                  },
                  fantasy_role: {
                    description: 'fantasy_role',
                    type: 'number',
                  },
                  team_id: {
                    description: 'team_id',
                    type: 'number',
                  },
                  team_name: {
                    description: 'team_name',
                    type: 'string',
                  },
                  team_tag: {
                    description: 'team_tag',
                    type: 'string',
                  },
                  is_locked: {
                    description: 'is_locked',
                    type: 'boolean',
                  },
                  is_pro: {
                    description: 'is_pro',
                    type: 'boolean',
                  },
                  locked_until: {
                    description: 'locked_until',
                    type: 'number',
                  },
                  steamid: {
                    description: 'steamid',
                    type: 'string',
                  },
                  avatar: {
                    description: 'avatar',
                    type: 'string',
                  },
                  avatarmedium: {
                    description: 'avatarmedium',
                    type: 'string',
                  },
                  avatarfull: {
                    description: 'avatarfull',
                    type: 'string',
                  },
                  profileurl: {
                    description: 'profileurl',
                    type: 'string',
                  },
                  last_login: {
                    description: 'last_login',
                    type: 'dateTime',
                  },
                  full_history_time: {
                    description: 'full_history_time',
                    type: 'dateTime',
                  },
                  cheese: {
                    description: 'cheese',
                    type: 'number',
                  },
                  fh_unavailable: {
                    description: 'fh_unavailable',
                    type: 'boolean',
                  },
                  loccountrycode: {
                    description: 'loccountrycode',
                    type: 'string',
                  },
                  last_played: {
                    description: 'last_played',
                    type: 'number',
                  },
                  win: {
                    description: 'win',
                    type: 'number',
                  },
                  games: {
                    description: 'games',
                    type: 'number',
                  },
                  with_win: {
                    description: 'with_win',
                    type: 'number',
                  },
                  with_games: {
                    description: 'with_games',
                    type: 'number',
                  },
                  against_win: {
                    description: 'against_win',
                    type: 'number',
                  },
                  against_games: {
                    description: 'against_games',
                    type: 'number',
                  },
                  with_gpm_sum: {
                    description: 'with_gpm_sum',
                    type: 'number',
                  },
                  with_xpm_sum: {
                    description: 'with_xpm_sum',
                    type: 'number',
                  },
                },
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
    '/players/{account_id}/totals': {
      get: {
        summary: 'GET /players/{account_id}/totals',
        description: 'Totals in stats',
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
                properties: {
                  field: {
                    description: 'field',
                    type: 'string',
                  },
                  n: {
                    description: 'number',
                    type: 'number',
                  },
                  sum: {
                    description: 'sum',
                    type: 'number',
                  },
                },
              },
            },
          },
        },
        route: () => '/players/:account_id/totals',
        func: (req, res, cb) => {
          const result = {};
          Object.keys(subkeys).forEach((key) => {
            result[key] = {
              field: key,
              n: 0,
              sum: 0,
            };
          });
          req.queryObj.project = req.queryObj.project.concat(Object.keys(subkeys));
          queries.getPlayerMatches(req.params.account_id, req.queryObj, (err, cache) => {
            if (err) {
              return cb(err);
            }
            cache.forEach((m) => {
              console.log(m);
              Object.keys(subkeys).forEach((key) => {
                if (m[key] !== null && m[key] !== undefined) {
                  result[key].n += 1;
                  result[key].sum += Number(m[key]);
                }
              });
            });
            return res.json(Object.keys(result).map(key => result[key]));
          });
        },
      },
    },
    '/players/{account_id}/counts': {
      get: {
        summary: 'GET /players/{account_id}/counts',
        description: 'Counts in categories',
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
              m.is_radiant = utility.isRadiant(m);
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
        summary: 'GET /players/{account_id}/histograms',
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
        summary: 'GET /players/{account_id}/wardmap',
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
        summary: 'GET /players/{account_id}/wordcloud',
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
        summary: 'GET /players/{account_id}/ratings',
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
                properties: {
                  account_id: {
                    description: 'account_id',
                    type: 'number',
                  },
                  match_id: {
                    description: 'match_id',
                    type: 'number',
                  },
                  solo_competitive_rank: {
                    description: 'solo_competitive_rank',
                    type: 'number',
                  },
                  competitive_rank: {
                    description: 'competitive_rank',
                    type: 'number',
                  },
                  time: {
                    description: 'time',
                    type: 'dateTime',
                  },
                },
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
        summary: 'GET /players/{account_id}/rankings',
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
                properies: {
                  hero_id: {
                    description: 'hero_id',
                    type: 'string',
                  },
                  rank: {
                    description: 'rank',
                    type: 'number',
                  },
                  card: {
                    description: 'card',
                    type: 'number',
                  },
                },
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
        summary: 'POST /players/{account_id}/refresh',
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
        summary: 'GET /proPlayers',
        description: 'Get list of pro players',
        tags: ['pro players'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  account_id: {
                    description: 'account_id',
                    type: 'number',
                  },
                  steamid: {
                    description: 'steamid',
                    type: 'string',
                  },
                  avatar: {
                    description: 'avatar',
                    type: 'string',
                  },
                  avatarmedium: {
                    description: 'avatarmedium',
                    type: 'string',
                  },
                  avatarfull: {
                    description: 'avatarfull',
                    type: 'string',
                  },
                  profileurl: {
                    description: 'profileurl',
                    type: 'string',
                  },
                  personaname: {
                    description: 'personaname',
                    type: 'string',
                  },
                  last_login: {
                    description: 'last_login',
                    type: 'dateTime',
                  },
                  full_history_time: {
                    description: 'full_history_time',
                    type: 'dateTime',
                  },
                  cheese: {
                    description: 'cheese',
                    type: 'number',
                  },
                  fh_unavailable: {
                    description: 'fh_unavailable',
                    type: 'boolean',
                  },
                  loccountrycode: {
                    description: 'loccountrycode',
                    type: 'string',
                  },
                  name: {
                    description: 'name',
                    type: 'string',
                  },
                  country_code: {
                    description: 'country_code',
                    type: 'string',
                  },
                  fantasy_role: {
                    description: 'fantasy_role',
                    type: 'number',
                  },
                  team_id: {
                    description: 'team_id',
                    type: 'number',
                  },
                  team_name: {
                    description: 'team_name',
                    type: 'string',
                  },
                  team_tag: {
                    description: 'team_tag',
                    type: 'string',
                  },
                  is_locked: {
                    description: 'is_locked',
                    type: 'boolean',
                  },
                  is_pro: {
                    description: 'is_pro',
                    type: 'boolean',
                  },
                  locked_until: {
                    description: 'locked_until',
                    type: 'number',
                  },
                },
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
        summary: 'GET /proMatches',
        description: 'Get list of pro matches',
        tags: ['pro matches'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  match_id: {
                    description: 'match_id',
                    type: 'number',
                  },
                  duration: {
                    description: 'duration',
                    type: 'number',
                  },
                  start_time: {
                    description: 'start_time',
                    type: 'number',
                  },
                  radiant_team_id: {
                    description: 'radiant_team_id',
                    type: 'number',
                  },
                  radiant_name: {
                    description: 'radiant_name',
                    type: 'string',
                  },
                  dire_team_id: {
                    description: 'dire_team_id',
                    type: 'number',
                  },
                  dire_name: {
                    description: 'dire_name',
                    type: 'string',
                  },
                  leagueid: {
                    description: 'leagueid',
                    type: 'number',
                  },
                  league_name: {
                    description: 'league_name',
                    type: 'string',
                  },
                  series_id: {
                    description: 'series_id',
                    type: 'number',
                  },
                  series_type: {
                    description: 'series_type',
                    type: 'number',
                  },
                  radiant_win: {
                    description: 'radiant_win',
                    type: 'boolean',
                  },
                },
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
          series_id, series_type,
          radiant_win
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
        summary: 'GET /publicMatches',
        description: 'Get list of randomly sampled public matches ordered by MMR',
        tags: ['public matches'],
        parameters: [
          params.mmrAscendingParam,
        ],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  match_id: {
                    description: 'match_id',
                    type: 'number',
                  },
                  match_seq_num: {
                    description: 'match_seq_num',
                    type: 'number',
                  },
                  radiant_win: {
                    description: 'radiant_win',
                    type: 'number',
                  },
                  start_time: {
                    description: 'start_time',
                    type: 'number',
                  },
                  duration: {
                    description: 'duration',
                    type: 'number',
                  },
                  avg_mmr: {
                    description: 'avg_mmr',
                    type: 'number',
                  },
                  num_mmr: {
                    description: 'num_mmr',
                    type: 'number',
                  },
                  radiant_team: {
                    description: 'radiant_team',
                    type: 'string',
                  },
                  dire_team: {
                    description: 'dire_team',
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        route: () => '/publicMatches',
        func: (req, res, cb) => {
          const minTime = moment().subtract(3, 'day').format('X');
          const order = req.query.mmr_ascending ? 'ASC' : 'DESC';
          db.raw(`
          WITH match_ids AS (SELECT match_id FROM public_matches
          WHERE start_time > ?
          ORDER BY avg_mmr ${order}
          LIMIT 100)
          SELECT * FROM
          (SELECT * FROM public_matches
          WHERE match_id IN (SELECT match_id FROM match_ids)) matches
          JOIN 
          (SELECT match_id, string_agg(hero_id::text, ',') radiant_team FROM public_player_matches WHERE match_id IN (SELECT match_id FROM match_ids) AND player_slot <= 127 GROUP BY match_id) radiant_team
          USING(match_id)
          JOIN
          (SELECT match_id, string_agg(hero_id::text, ',') dire_team FROM public_player_matches WHERE match_id IN (SELECT match_id FROM match_ids) AND player_slot > 127 GROUP BY match_id) dire_team
          USING(match_id)
          ORDER BY avg_mmr ${order}
          `, [minTime])
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
        summary: 'GET /heroStats',
        description: 'Get stats about hero performance in recent matches',
        tags: ['hero stats'],
        parameters: [],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    description: 'id',
                    type: 'number',
                  },
                  name: {
                    description: 'name',
                    type: 'string',
                  },
                  localized_name: {
                    description: 'localized_name',
                    type: 'string',
                  },
                  img: {
                    description: 'img',
                    type: 'string',
                  },
                  icon: {
                    description: 'icon',
                    type: 'string',
                  },
                  pro_win: {
                    description: 'pro_win',
                    type: 'number',
                  },
                  pro_pick: {
                    description: 'pro_pick',
                    type: 'number',
                  },
                  hero_id: {
                    description: 'hero_id',
                    type: 'number',
                  },
                  pro_ban: {
                    description: 'pro_ban',
                    type: 'number',
                  },
                  '1000_pick': {
                    description: '1000_pick',
                    type: 'number',
                  },
                  '1000_win': {
                    description: '1000_win',
                    type: 'number',
                  },
                  '2000_pick': {
                    description: '2000_pick',
                    type: 'number',
                  },
                  '2000_win': {
                    description: '2000_win',
                    type: 'number',
                  },
                  '3000_pick': {
                    description: '3000_pick',
                    type: 'number',
                  },
                  '3000_win': {
                    description: '3000_win',
                    type: 'number',
                  },
                  '4000_pick': {
                    description: '4000_pick',
                    type: 'number',
                  },
                  '4000_win': {
                    description: '4000_win',
                    type: 'number',
                  },
                  '5000_pick': {
                    description: '5000_pick',
                    type: 'number',
                  },
                  '5000_win': {
                    description: '5000_win',
                    type: 'number',
                  },
                },
              },
            },
          },
        },
        route: () => '/heroStats',
        func: (req, res, cb) => {
          // fetch from cached redis value
          redis.get('heroStats', (err, result) => {
            if (err) {
              return cb(err);
            }
            return res.json(JSON.parse(result));
          });
        },
      },
    },
    '/explorer': {
      get: {
        summary: 'GET /explorer',
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
        summary: 'GET /metadata',
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
                  properties: {
                    cheese: {
                      description: 'cheese',
                      type: 'string',
                    },
                    goal: {
                      description: 'goal',
                      type: 'string',
                    },
                  },
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
        summary: 'GET /distributions',
        description: 'Distributions of MMR data by bracket and country',
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
                  properties: {
                    commmand: {
                      description: 'command',
                      type: 'string',
                    },
                    rowCount: {
                      description: 'rowCount',
                      type: 'number',
                    },
                    rows: {
                      description: 'rows',
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          bin: {
                            description: 'bin',
                            type: 'number',
                          },
                          bin_name: {
                            description: 'bin_name',
                            type: 'number',
                          },
                          count: {
                            description: 'count',
                            type: 'number',
                          },
                          cumulative_sum: {
                            description: 'cumulative_sum',
                            type: 'number',
                          },
                        },
                      },
                    },
                    fields: {
                      description: 'fields',
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: {
                            description: 'name',
                            type: 'string',
                          },
                          tableID: {
                            description: 'tableID',
                            type: 'number',
                          },
                          columnID: {
                            description: 'columnID',
                            type: 'number',
                          },
                          dataTypeID: {
                            description: 'dataTypeID',
                            type: 'number',
                          },
                          dataTypeSize: {
                            description: 'dataTypeSize',
                            type: 'number',
                          },
                          dataTypeModifier: {
                            description: 'dataTypeModifier',
                            type: 'number',
                          },
                          format: {
                            description: 'format',
                            type: 'string',
                          },
                        },
                      },
                    },
                    rowAsArray: {
                      description: 'rowAsArray',
                      type: 'boolean',
                    },
                    sum: {
                      description: 'sum',
                      type: 'object',
                      properties: {
                        count: {
                          description: 'count',
                          type: 'number',
                        },
                      },
                    },
                  },
                },
                country_mmr: {
                  description: 'country_mmr',
                  type: 'object',
                  properties: {
                    commmand: {
                      description: 'command',
                      type: 'string',
                    },
                    rowCount: {
                      description: 'rowCount',
                      type: 'number',
                    },
                    rows: {
                      description: 'rows',
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          loccountrycode: {
                            description: 'loccountrycode',
                            type: 'string',
                          },
                          count: {
                            description: 'count',
                            type: 'number',
                          },
                          avg: {
                            description: 'avg',
                            type: 'string',
                          },
                          common: {
                            description: 'common',
                            type: 'string',
                          },
                        },
                      },
                    },
                    fields: {
                      description: 'fields',
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: {
                            description: 'name',
                            type: 'string',
                          },
                          tableID: {
                            description: 'tableID',
                            type: 'number',
                          },
                          columnID: {
                            description: 'columnID',
                            type: 'number',
                          },
                          dataTypeID: {
                            description: 'dataTypeID',
                            type: 'number',
                          },
                          dataTypeSize: {
                            description: 'dataTypeSize',
                            type: 'number',
                          },
                          dataTypeModifier: {
                            description: 'dataTypeModifier',
                            type: 'number',
                          },
                          format: {
                            description: 'format',
                            type: 'string',
                          },
                        },
                      },
                    },
                    rowAsArray: {
                      description: 'rowAsArray',
                      type: 'boolean',
                    },
                  },
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
        summary: 'GET /search',
        description: 'Search players by personaname. Default similarity is 0.51',
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
                properties: {
                  account_id: {
                    description: 'account_id',
                    type: 'number',
                  },
                  avatarfull: {
                    description: 'avatarfull',
                    type: 'string',
                  },
                  personaname: {
                    description: 'personaname',
                    type: 'string',
                  },
                  similarity: {
                    description: 'similarity',
                    type: 'number',
                  },
                },
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
        summary: 'GET /rankings',
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
                  properties: {
                    account_id: {
                      description: 'account_id',
                      type: 'string',
                    },
                    score: {
                      description: 'score',
                      type: 'string',
                    },
                    steamid: {
                      description: 'steamid',
                      type: 'string',
                    },
                    avatar: {
                      description: 'avatar',
                      type: 'string',
                    },
                    avatarmedium: {
                      description: 'avatarmedium',
                      type: 'string',
                    },
                    avatarfull: {
                      description: 'avatarfull',
                      type: 'string',
                    },
                    profileurl: {
                      description: 'profileurl',
                      type: 'string',
                    },
                    personaname: {
                      description: 'personaname',
                      type: 'string',
                    },
                    last_login: {
                      description: 'last_login',
                      type: 'dateTime',
                    },
                    full_history_time: {
                      description: 'full_history_time',
                      type: 'dateTime',
                    },
                    cheese: {
                      description: 'cheese',
                      type: 'number',
                    },
                    fh_unavailable: {
                      description: 'fh_unavailable',
                      type: 'boolean',
                    },
                    loccountrycode: {
                      description: 'loccountrycode',
                      type: 'string',
                    },
                    solo_competitive_rank: {
                      description: 'solo_competitive_rank',
                      type: 'string',
                    },
                  },
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
        summary: 'GET /benchmarks',
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
                  properties: {
                    gold_per_min: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                    xp_per_min: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                    kills_per_min: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                    last_hits_per_min: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                    hero_damage_per_min: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                    hero_healing_per_min: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                    tower_damage: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          percentile: {
                            description: 'percentile',
                            type: 'number',
                          },
                          value: {
                            description: 'value',
                            type: 'number',
                          },
                        },
                      },
                    },
                  },
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
        summary: 'GET /status',
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
        summary: 'GET /health',
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
        summary: 'GET /request/{jobId}',
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
        summary: 'POST /request/{match_id}',
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
            if (err) {
              console.error(err);
            }
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
              redis.zadd('requests', moment().format('X'), `${uuidV4()}:${match.match_id}`);
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
        summary: 'GET /heroes',
        description: 'Get hero data',
        tags: ['heroes'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    description: 'id',
                    type: 'number',
                  },
                  name: {
                    description: 'name',
                    type: 'string',
                  },
                  localized_name: {
                    description: 'localized_name',
                    type: 'string',
                  },
                },
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
        summary: 'GET /leagues',
        description: 'Get league data',
        tags: ['leagues'],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  leagueid: {
                    description: 'leagueid',
                    type: 'number',
                  },
                  ticket: {
                    description: 'ticket',
                    type: 'string',
                  },
                  banner: {
                    description: 'banner',
                    type: 'string',
                  },
                  tier: {
                    description: 'tier',
                    type: 'string',
                  },
                  name: {
                    description: 'name',
                    type: 'string',
                  },
                },
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
    '/teams': {
      get: {
        summary: 'GET /teams',
        description: 'Get team data',
        tags: ['teams'],
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
        route: () => '/teams',
        func: (req, res, cb) => {
          db.select()
            .from('teams')
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
        summary: 'GET /replays',
        description: 'Get data to construct a replay URL with',
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
                },
              },
            },
          },
        },
        route: () => '/replays',
        func: (req, res, cb) => {
          /*
          db.select(['match_id', 'cluster', 'replay_salt'])
           .from('match_gcdata')
           .whereIn('match_id', [].concat(req.query.match_id || []).slice(0, 20))
           .asCallback((err, result) => {
          */
          async.map([].concat(req.query.match_id || []).slice(0, 50),
            (matchId, cb) =>
              getGcData(db, redis, {
                match_id: matchId,
                noRetry: true,
              }, (err, result) => {
                if (err) {
                  console.error(err);
                }
                return cb(null, result);
              }
            ),
            (err, result) => {
              if (err) {
                return cb(err);
              }
              return res.json(result.filter(Boolean));
            });
        },
      },
    },
    '/records/{field}': {
      get: {
        summary: 'GET /records/{field}',
        description: 'Get top performances in a stat',
        tags: ['records'],
        parameters: [{
          name: 'field',
          in: 'path',
          description: 'Field name to query',
          required: true,
          type: 'string',
        }],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  match_id: {
                    description: 'match_id',
                    type: 'number',
                  },
                  start_time: {
                    description: 'start_time',
                    type: 'number',
                  },
                  hero_id: {
                    description: 'hero_id',
                    type: 'number',
                  },
                  score: {
                    description: 'score',
                    type: 'number',
                  },
                },
              },
            },
          },
        },
        route: () => '/records/:field',
        func: (req, res, cb) => {
          redis.zrevrange(`records:${req.params.field}`, 0, 99, 'WITHSCORES', (err, rows) => {
            if (err) {
              return cb(err);
            }
            const entries = rows.map((r, i) =>
            ({
              match_id: r.split(':')[0],
              start_time: r.split(':')[1],
              hero_id: r.split(':')[2],
              score: rows[i + 1],
            })
            ).filter((r, i) =>
              i % 2 === 0
            );
            return res.json(entries);
          });
        },
      },
    },
    '/schema': {
      get: {
        summary: 'GET /schema',
        description: 'Get database schema',
        tags: ['schema'],
        parameters: [],
        responses: {
          200: {
            description: 'Success',
            schema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  table_name: {
                    description: 'table_name',
                    type: 'string',
                  },
                  column_name: {
                    description: 'column_name',
                    type: 'string',
                  },
                  data_type: {
                    description: 'data_type',
                    type: 'string',
                  },
                },
              },
            },
          },
        },
        route: () => '/schema',
        func: (req, res, cb) => {
          db.select(['table_name', 'column_name', 'data_type'])
          .from('information_schema.columns')
          .where({ table_schema: 'public' })
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
