/**
 * Worker running tasks on timed intervals
 * */
const config = require('../config');
const constants = require('dotaconstants');
const redis = require('../store/redis');
const db = require('../store/db');
const queries = require('../store/queries');
const buildSets = require('../store/buildSets');
const utility = require('../util/utility');
// const getMMStats = require('../util/getMMStats');
const vdf = require('simple-vdf');
const async = require('async');
const fs = require('fs');
const moment = require('moment');

const sql = {};
const sqlq = fs.readdirSync('./sql');
sqlq.forEach((f) => {
  sql[f.split('.')[0]] = fs.readFileSync(`./sql/${f}`, 'utf8');
});

function invokeInterval(func, delay) {
  // invokes the function immediately, waits for callback, waits the delay, and then calls it again
  (function invoker() {
    redis.get(`worker:${func.name}`, (err, fresh) => {
      if (err) {
        return setTimeout(invoker, delay);
      }
      if (fresh && config.NODE_ENV !== 'development') {
        console.log('skipping %s', func.name);
        return setTimeout(invoker, delay);
      }
      console.log('running %s', func.name);
      console.time(func.name);
      return func((err) => {
        if (err) {
          // log the error, but wait until next interval to retry
          console.error(err);
        } else {
          // mark success, don't redo until this key expires
          redis.setex(`worker:${func.name}`, (delay / 1000) * 0.9, '1');
        }
        console.timeEnd(func.name);
        setTimeout(invoker, delay);
      });
    });
  }());
}

function doBuildSets(cb) {
  buildSets(db, redis, cb);
}
/*
function doMMStats(cb) {
  getMMStats(redis, cb);
}
*/
function doDistributions(cb) {
  function loadData(key, mapFunc, cb) {
    db.raw(sql[key]).asCallback((err, results) => {
      if (err) {
        return cb(err);
      }
      mapFunc(results);
      return cb(err, results);
    });
  }
  async.parallel({
    country_mmr(cb) {
      const mapFunc = function mapCountryMmr(results) {
        results.rows = results.rows.map((r) => {
          const ref = constants.countries[r.loccountrycode];
          r.common = ref ? ref.name.common : r.loccountrycode;
          return r;
        });
      };
      loadData('country_mmr', mapFunc, cb);
    },
    mmr(cb) {
      const mapFunc = function mapMmr(results) {
        const sum = results.rows.reduce((prev, current) =>
          ({
            count: prev.count + current.count,
          }), {
          count: 0,
        });
        results.rows = results.rows.map((r, i) => {
          r.cumulative_sum = results.rows.slice(0, i + 1).reduce((prev, current) =>
            ({
              count: prev.count + current.count,
            }), {
            count: 0,
          }).count;
          return r;
        });
        results.sum = sum;
      };
      loadData('mmr', mapFunc, cb);
    },
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    Object.keys(result).forEach((key) => {
      redis.set(`distribution:${key}`, JSON.stringify(result[key]));
    });
    return cb(err);
  });
}

function doProPlayers(cb) {
  const container = utility.generateJob('api_notable', {});
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    return async.each(body.player_infos, (p, cb) => {
      if ((p.account_id === 180012313 || p.account_id === 323792491)
        && p.locked_until < 1502694000) {
        p.locked_until = 1502694000;
      }
      queries.upsert(db, 'notable_players', p, {
        account_id: p.account_id,
      }, cb);
    }, cb);
  });
}

function doLeagues(cb) {
  const container = utility.generateJob('api_leagues', {
    language: 'english',
  });
  utility.getData(container.url, (err, apiLeagues) => {
    if (err) {
      return cb(err);
    }
    return utility.getData({
      url: 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/items/items_game.txt',
      raw: true,
    },
      (err, body) => {
        if (err) {
          return cb(err);
        }
        const itemData = vdf.parse(body);
        const leagues = {};
        Object.keys(itemData.items_game.items).forEach((key) => {
          const item = itemData.items_game.items[key];
          if (item.prefab === 'league' && item.tool && item.tool.usage) {
            const leagueid = item.tool.usage.league_id;
            const tier = item.tool.usage.tier;
            const ticket = item.image_inventory;
            const banner = item.image_banner;
            leagues[leagueid] = { tier, ticket, banner };
          }
        });
        // League tier corrections and missing data
        const leagueTiers = {
          4177: 'excluded', // CDEC Master
          94: 'amateur', // South Ural League Season 2
          216: 'amateur', // Steelseries Malaysia Cup - February
          221: 'professional', // CEVO Season 4
          99: 'professional', // SteelSeries Euro Cup Season 2
          65013: 'professional', // MLG $50,000 Dota 2 Championship
          227: 'amateur', // CFC Elite Cup
          109: 'professional', // Fragbite Masters
          112: 'professional', // ASUS ROG DreamLeague
          123: 'professional', // Yard Orange Festival
          131: 'amateur', // Gigabyte Premier League Season 1
          117: 'amateur', // South American Elite League
          134: 'professional', // Elite Southeast Asian League
          146: 'professional', // Asian Cyber Games Dota 2 Championship 2013
          160: 'professional', // Prodota Winter Cup
          174: 'professional', // Asian Cyber Games Invitational: Best of the Best
          8: 'professional', // Prodota 2 Worldwide League
          16: 'professional', // GosuLeague
          20: 'professional', // Star Series Season IV
          52: 'professional', // REDBULL Esports Champion League 2013 Bundle
          61: 'professional', // Electronic Sports World Cup 2013
          70: 'professional', // RaidCall EMS One Fall 2013
          21: 'professional', // The Defense 3
          27: 'professional', // The Premier League Season 4
          103: 'professional', // Dota 2 Champions League
          29: 'professional', // Star Series Season V
          83: 'professional', // CyberGamer Dota 2 Pro League
          33: 'professional', // DreamHack Dota2 Invitational
          48: 'professional', // RaidCall Dota 2 League Season 3
          51: 'professional', // The Defense Season 4
          65: 'professional', // SteelSeries Euro Cup
          69: 'professional', // StarSeries Season 7 - BUNDLE
          78: 'professional', // WePlay.TV Dota 2 League - Season 2
          97: 'professional', // Netolic Pro League 4
          104: 'professional', // HyperX D2L Season 4
          47: 'professional', // RaidCall EMS One Summer 2013
          53: 'professional', // DreamHack ASUS ROG Dota 2 Tournament
          161: 'professional', // SteelSeries Euro Cup Season 3
          7: 'professional', // BeyondTheSummit World Tour
          28: 'professional', // RaidCall EMS One Spring 2013
          65004: 'professional', // The International East Qualifiers
          46: 'professional', // StarSeries Season VI
          12: 'professional', // RaidCall Dota 2 League
          15: 'professional', // Premier League
          26: 'professional', // SEA League
          41: 'professional', // Curse Dota 2 Invitational
          45: 'professional', // Premier League Season 5
          50: 'professional', // American Dota League
          65005: 'professional', // The International West Qualifiers
          181: 'professional', // joinDOTA League
          4: 'professional', // The Defense
          184: 'professional', // MLG T.K.O.
          6: 'professional', // Star Series Season II Lan Final
          13: 'professional', // Star Series Season III
          65001: 'professional', // The International 2012
          24: 'professional', // G-League 2012
          176: 'professional', // Netolic Pro League 5 West
          54: 'professional', // Alienware Cup - 2013 Season 1
          135: 'professional', // Raidcall Southeast Asian Invitational League
          38: 'professional', // E2Max L33T Championship
          58: 'professional', // AMD Dota2 Premier League Season 2
          92: 'professional', // Arms of Burning Turmoil Set
          65008: 'professional', // 2013 National Electronic Sports Tournament
          235: 'professional', // The Monster Invitational
          18: 'professional', // atoD 2
          22: 'professional', // RaidCall Dota 2 League Season 2
          65002: 'professional', // DreamHack Dota 2 Corsair Vengeance Cup
          34: 'professional', // G-1 Champions League Season 5
          40: 'professional', // AMD Dota2 Premier League
          60: 'professional', // Neolution GosuCup
          0: 'amateur', // JetsetPro Amateur League 1x1 Season 1
          67: 'professional', // MLG NA League and Full Sail LAN
          71: 'professional', // The National
          80: 'professional', // Nexon Sponsorship League - ADMIN
          44: 'professional', // Rapture Gaming Network League
          76: 'professional', // Sina Cup Supernova Dota 2 Open
          81: 'professional', // WPC-ACE Dota 2 League
          114: 'professional', // G-League 2013
          177: 'professional', // Netolic Pro League 5 East
          17: 'professional', // G-1 Championship League
          23: 'professional', // Dota 2 The Asia
          37: 'professional', // AtoD 3
          42: 'professional', // Dota 2 Super League
          65007: 'professional', // Nexon Starter League
          57: 'professional', // Corsair Summer 2013
          120: 'professional', // Sina Cup Supernova Dota 2 Open Season 2
          125: 'professional', // Nexon Sponsorship League Season 2 & Gama Brothers Courier
        };
        const openQualifierTier = league => (league.name.indexOf('Open Qualifier') === -1 ? null : 'excluded');
        return async.each(apiLeagues.result.leagues, (l, cb) => {
          const itemSchemaLeague = leagues[l.leagueid] || {};
          l.tier = leagueTiers[l.leagueid] || openQualifierTier(l) || itemSchemaLeague.tier || null;
          l.ticket = itemSchemaLeague.ticket || null;
          l.banner = itemSchemaLeague.banner || null;
          queries.upsert(db, 'leagues', l, {
            leagueid: l.league_id,
          }, cb);
        }, cb);
      },
    );
  });
}

function doTeams(cb) {
  db.raw('select distinct team_id from team_match').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return async.eachSeries(result.rows, (m, cb) => {
      if (!m.team_id) {
        return cb();
      }
      // GetTeamInfo disabled as of october 2017
      /*
      const container = utility.generateJob('api_teams', {
        // 2 is the smallest team id, use as default
        team_id: m.team_id || 2,
      });
      */
      const container = utility.generateJob('api_team_info_by_team_id', {
        start_at_team_id: m.team_id,
      });
      utility.getData({ url: container.url, raw: true }, (err, body) => {
        if (err) {
          return cb(err);
        }
        const raw = body;
        body = JSON.parse(body);
        if (!body.result || !body.result.teams) {
          return cb();
        }
        const t = body.result.teams[0];
        // The logo value is a 64 bit integer which is too large to represent in JSON
        // so need to read the raw response value, JSON.parse will return an incorrect value in the logo field
        const logoRegex = /^"logo":(.*),$/m;
        const match = logoRegex.exec(raw);
        const logoUgc = match[1];
        const ugcJob = utility.generateJob('api_get_ugc_file_details', {
          ugcid: logoUgc,
        });
        utility.getData(ugcJob.url, (err, body) => {
          if (err) {
            return cb(err);
          }
          t.team_id = m.team_id;
          t.logo_url = body.data && body.data.url;
          return queries.upsert(db, 'teams', t, {
            team_id: m.team_id,
          }, cb);
        });
      });
    }, cb);
  });
}

function doHeroes(cb) {
  const container = utility.generateJob('api_heroes', {
    language: 'english',
  });
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.heroes) {
      return cb();
    }
    return utility.getData('https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json', (err, heroData) => {
      if (err || !heroData) {
        return cb();
      }
      return async.eachSeries(body.result.heroes, (hero, cb) => {
        const heroDataHero = heroData[hero.id] || {};
        queries.upsert(db, 'heroes', Object.assign({}, hero, {
          primary_attr: heroDataHero.primary_attr,
          attack_type: heroDataHero.attack_type,
          roles: heroDataHero.roles,
          legs: heroDataHero.legs,
        }), {
          id: hero.id,
        }, cb);
      }, cb);
    });
  });
}

function doItems(cb) {
  const container = utility.generateJob('api_items', {
    language: 'english',
  });
  utility.getData(container.url, (err, body) => {
    if (err) {
      return cb(err);
    }
    if (!body || !body.result || !body.result.items) {
      return cb();
    }
    return async.eachSeries(body.result.items, (item, cb) => {
      queries.upsert(db, 'items', item, {
        id: item.id,
      }, cb);
    });
  });
}

function doCosmetics(cb) {
    utility.getData({ url: 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/items/items_game.txt',
    raw: true },
    (err, body) => {
      if (err) {
        return cb(err);
      }
      const itemData = vdf.parse(body);
      console.log(Object.keys(itemData.items_game.items).length);
      return async.eachLimit(Object.keys(itemData.items_game.items), 5, (itemId, cb) => {
        const item = itemData.items_game.items[itemId];
        item.item_id = Number(itemId);
        const hero = item.used_by_heroes && typeof (item.used_by_heroes) === 'object' && Object.keys(item.used_by_heroes)[0];

        function insert(cb) {
          // console.log(item);
          return queries.upsert(db, 'cosmetics', item, {
            item_id: item.item_id,
          }, cb);
        }
        if (hero) {
          item.used_by_heroes = hero;
        }
        // console.log(item);
        if (!item.item_id) {
          return cb();
        }
        if (item.image_inventory) {
          const spl = item.image_inventory.split('/');
          const iconname = spl[spl.length - 1];
          return utility.getData({
            url: utility.generateJob('api_item_icon', {
              iconname,
            }).url,
            noRetry: true,
          }, (err, body) => {
            if (err || !body || !body.result) {
              return cb();
            }
            item.image_path = body.result.path;
            return insert(cb);
          });
        }
        return insert(cb);
      }, cb);
    },
  );
}

function doHeroStats(cb) {
  const minTime = moment().subtract(30, 'day').format('X');
  const maxTime = moment().format('X');
  async.parallel({
    publicHeroes(cb) {
      db.raw(`
              SELECT
              LEAST(GREATEST(avg_mmr / 1000 * 1000, 1000), 5000) as avg_mmr_bucket,
              sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as win, 
              count(*) as pick,
              hero_id 
              FROM public_player_matches 
              JOIN 
              (SELECT * FROM public_matches
              TABLESAMPLE SYSTEM_ROWS(5000000)
              WHERE start_time > ?
              AND start_time < ?)
              matches_list USING(match_id)
              GROUP BY avg_mmr_bucket, hero_id
              ORDER BY hero_id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
    proHeroes(cb) {
      db.raw(`
              SELECT 
              sum(case when radiant_win = (player_slot < 128) then 1 else 0 end) as pro_win, 
              count(hero_id) as pro_pick,
              heroes.id as hero_id
              FROM heroes
              LEFT JOIN player_matches ON heroes.id = player_matches.hero_id
              LEFT JOIN matches on player_matches.match_id = matches.match_id
              WHERE start_time > ?
              AND start_time < ?
              GROUP BY heroes.id
              ORDER BY heroes.id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
    proBans(cb) {
      db.raw(`
              SELECT 
              count(hero_id) as pro_ban,
              heroes.id as hero_id
              FROM heroes
              LEFT JOIN picks_bans ON heroes.id = picks_bans.hero_id AND is_pick IS FALSE
              LEFT JOIN matches on picks_bans.match_id = matches.match_id
              WHERE start_time > ?
              AND start_time < ?
              GROUP BY heroes.id
              ORDER BY heroes.id
          `, [minTime, maxTime])
        .asCallback(cb);
    },
  }, (err, result) => {
    if (err) {
      return cb(err);
    }
    // Build object keyed by hero_id for each result array
    const objectResponse = JSON.parse(JSON.stringify(constants.heroes));
    Object.keys(result).forEach((key) => {
      result[key].rows.forEach((row) => {
        objectResponse[row.hero_id] = Object.assign(
          {}, objectResponse[row.hero_id],
          key === 'publicHeroes' ? {
            [`${row.avg_mmr_bucket}_pick`]: row.pick,
            [`${row.avg_mmr_bucket}_win`]: row.win,
          } : row,
        );
      });
    });
    return redis.set('heroStats', JSON.stringify(Object.keys(objectResponse).map(key => objectResponse[key])), cb);
  });
}

function doLiveGames(cb) {
  // Get the list of pro players
  db.select().from('notable_players').asCallback((err, proPlayers) => {
    const liveGamesUrl = utility.generateJob('api_top_live_game').url;
    // Get the list of live games
    utility.getData(liveGamesUrl, (err, json) => {
      if (err) {
        return cb(err);
      }
      // If a match contains a pro player
      // add their name to the match object, save it to redis zset, keyed by server_steam_id
      return async.eachSeries(json.game_list, (match, cb) => {
        // let addToRedis = false;
        match.players.forEach((player, i) => {
          const proPlayer = proPlayers.find(proPlayer =>
            proPlayer.account_id.toString() === player.account_id.toString());
          if (proPlayer) {
            match.players[i] = Object.assign({}, player, proPlayer);
            // addToRedis = true;
          }
        });
        redis.zadd('liveGames', match.lobby_id, JSON.stringify(match));
        // Keep only the 100 highest values
        redis.zremrangebyrank('liveGames', '0', '-101');
        cb();
        // Get detailed stats for each live game
        // const { url } = utility.generateJob('api_realtime_stats', {
        //   server_steam_id: match.server_steam_id
        // }).url;
      }, cb);
    });
  });
}

invokeInterval(doBuildSets, 60 * 1000);
// invokeInterval(doMMStats, config.MMSTATS_DATA_INTERVAL * 60 * 1000); // Sample every 3 minutes
invokeInterval(doDistributions, 6 * 60 * 60 * 1000);
invokeInterval(doProPlayers, 30 * 60 * 1000);
invokeInterval(doLeagues, 30 * 60 * 1000);
invokeInterval(doTeams, 60 * 60 * 1000);
invokeInterval(doHeroes, 60 * 60 * 1000);
invokeInterval(doItems, 60 * 60 * 1000);
// invokeInterval(doCosmetics, 12 * 60 * 60 * 1000);
invokeInterval(doHeroStats, 60 * 60 * 1000);
invokeInterval(doLiveGames, 60 * 1000);
