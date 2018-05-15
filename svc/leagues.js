const vdf = require('simple-vdf');
const async = require('async');
const utility = require('../util/utility');
const db = require('../store/db');
const queries = require('../store/queries');

const { invokeInterval, generateJob, getData, cleanItemSchema } = utility;

function doLeagues(cb) {
  const container = generateJob('api_leagues', {
    language: 'english',
  });
  getData(container.url, (err, apiLeagues) => {
    if (err) {
      return cb(err);
    }
    return getData(
      {
        url: 'https://raw.githubusercontent.com/SteamDatabase/GameTracking-Dota2/master/game/dota/pak01_dir/scripts/items/items_game.txt',
        raw: true,
      },
      (err, body) => {
        if (err) {
          return cb(err);
        }
        const leagues = {};
        const itemData = vdf.parse(cleanItemSchema(body));
        Object.keys(itemData.items_game.items).forEach((key) => {
          const item = itemData.items_game.items[key];
          if (item.prefab === 'league' && item.tool && item.tool.usage) {
            const leagueid = item.tool.usage.league_id;
            const { tier } = item.tool.usage;
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
invokeInterval(doLeagues, 30 * 60 * 1000);
