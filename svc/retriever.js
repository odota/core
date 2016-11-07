/**
 * Worker interfacing with the Steam GC.
 * Provides HTTP endpoints for other workers.
 **/
const config = require('../config');
const Steam = require('steam');
const Dota2 = require('dota2');
const async = require('async');
const express = require('express');
const cp = require('child_process');
const app = express();
const steamObj = {};
const accountToIdx = {};
const launch = new Date();
const matchRequestDelay = 1200;
const minUpTimeSeconds = config.PROVIDER === 'gce' ? 0 : 610;
const timeoutMs = 15000;
const port = config.PORT || config.RETRIEVER_PORT;
let lastRequestTime;
let matchRequests = 0;
let timeouts = 0;
let count = 0;
let users = config.STEAM_USER.split(',');
let passes = config.STEAM_PASS.split(',');
if (config.STEAM_ACCOUNT_DATA) {
  const accountData = cp.execSync(`curl '${config.STEAM_ACCOUNT_DATA}'`).toString().split(/\r\n|\r|\n/g);
  const accountsToUse = 10;
  const startIndex = Math.floor((Math.random() * (accountData.length - accountsToUse)));
  console.log('total registered accounts: %s, startIndex: %s', accountData.length, startIndex);
  const accountDataToUse = accountData.slice(startIndex, startIndex + accountsToUse);
  users = accountDataToUse.map(a => a.split('\t')[0]);
  passes = accountDataToUse.map(a => a.split('\t')[1]);
  start();
} else {
  start();
}

function start() {
  console.log(users, passes);
  app.get('/healthz', (req, res, next) => {
    res.end('ok');
  });
  app.use((req, res, next) => {
    if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
      // reject request if it doesn't have key
      return next('invalid key');
    } else {
      next(null);
    }
  });
  app.get('/', (req, res, cb) => {
    // console.log(process.memoryUsage());
    const keys = Object.keys(steamObj);
    if (!keys.length) {
      return cb('No accounts ready');
    }
    const r = keys[Math.floor((Math.random() * keys.length))];
    if (req.query.mmstats) {
      getMMStats(r, (err, data) => {
        res.locals.data = data;
        return cb(err);
      });
    } else if (req.query.match_id) {
      // Don't allow requests coming in too fast
      const curRequestTime = new Date();
      if (lastRequestTime && (curRequestTime - lastRequestTime < matchRequestDelay)) {
        return res.status(429).json({
          error: 'too many requests',
        });
      }
      if (timeouts > 20) {
        // If we keep timing out, stop making requests
        if (getUptime() > minUpTimeSeconds) {
          return selfDestruct();
        }
        return cb('timeout count threshold exceeded');
      }
      lastRequestTime = curRequestTime;
      getGcMatchData(r, req.query.match_id, (err, data) => {
        res.locals.data = data;
        return cb(err);
      });
    } else if (req.query.account_id) {
      getPlayerProfile(r, req.query.account_id, (err, data) => {
        res.locals.data = data;
        return cb(err);
      });
    } else {
      res.locals.data = genStats();
      return cb();
    }
  });
  app.use((req, res) => {
    res.json(res.locals.data);
  });
  app.use((err, req, res, next) =>
    res.status(500).json({
      error: err,
    })
  );
  const server = app.listen(port, () => {
    const host = server.address().address;
    console.log('[RETRIEVER] listening at http://%s:%s', host, port);
  });
  async.each(Array.from(new Array(users.length), (v, i) => i), (i, cb) => {
    let dotaReady = false;
    const client = new Steam.SteamClient();
    client.steamUser = new Steam.SteamUser(client);
    client.steamFriends = new Steam.SteamFriends(client);
    client.Dota2 = new Dota2.Dota2Client(client, false, false);
    const user = users[i];
    const pass = passes[i];
    const logOnDetails = {
      account_name: user,
      password: pass,
    };
    client.connect();
    client.on('connected', () => {
      console.log('[STEAM] Trying to log on with %s,%s', user, pass);
      client.steamUser.logOn(logOnDetails);
      client.once('error', (e) => {
        console.log(e);
        console.log('reconnecting');
        client.connect();
      });
    });
    client.on('logOnResponse', (logonResp) => {
      if (logonResp.eresult !== Steam.EResult.OK) {
        // try logging on again
        return client.steamUser.logOn(logOnDetails);
      }
      if (client && client.steamID) {
        console.log('[STEAM] Logged on %s', client.steamID);
        client.steamFriends.setPersonaName(client.steamID.toString());
        client.matches = 0;
        client.profiles = 0;
        client.Dota2.once('ready', () => {
          steamObj[client.steamID] = client;
          dotaReady = true;
          allDone();
        });
        client.Dota2.launch();
        client.once('loggedOff', () => {
          console.log('relogging');
          client.steamUser.logOn(logOnDetails);
        });
      }
    });
    let cycled = false;

    function allDone() {
      if (dotaReady) {
        count += 1;
        console.log('acct %s ready, %s/%s', i, count, users.length);
        if (!cycled) {
          cycled = true;
          cb();
        }
      }
    }
  });

  function genStats() {
    const stats = {};
    const numReadyAccounts = Object.keys(steamObj).length;
    for (const key in steamObj) {
      stats[key] = {
        steamID: key,
        matches: steamObj[key].matches,
        profiles: steamObj[key].profiles,
        friends: Object.keys(steamObj[key].steamFriends.friends).length,
      };
    }
    const data = {
      matchRequests,
      uptime: getUptime(),
      numReadyAccounts,
      ready: numReadyAccounts === users.length,
      accounts: stats,
      accountToIdx,
    };
    return data;
  }

  function getMMStats(idx, cb) {
    steamObj[idx].Dota2.requestMatchmakingStats();
    steamObj[idx].Dota2.once('matchmakingStatsData', (waitTimes, searchingPlayers, disabledGroups, raw) => {
      if (disabledGroups) {
        cb(null, disabledGroups.legacy_searching_players_by_group_source2);
      } else {
        cb('error mmstats');
      }
    });
  }

  function getPlayerProfile(idx, account_id, cb) {
    account_id = Number(account_id);
    const Dota2 = steamObj[idx].Dota2;
    console.log('requesting player profile %s', account_id);
    steamObj[idx].profiles += 1;
    Dota2.requestProfileCard(account_id, (err, profileData) => {
      /*
     	enum EStatID {
		k_eStat_SoloRank = 1;
		k_eStat_PartyRank = 2;
		k_eStat_Wins = 3;
		k_eStat_Commends = 4;
		k_eStat_GamesPlayed = 5;
		k_eStat_FirstMatchDate = 6;
    	}
    	*/
      if (err) {
        return cb(err);
      }
      const response = {};
      profileData.slots.forEach((s) => {
        if (s.stat && s.stat.stat_id === 1) {
          response.solo_competitive_rank = s.stat.stat_score;
        }
        if (s.stat && s.stat.stat_id === 2) {
          response.competitive_rank = s.stat.stat_score;
        }
      });
      cb(err, response);
    });
  }

  function getGcMatchData(idx, match_id, cb) {
    const Dota2 = steamObj[idx].Dota2;
    console.log('[DOTA] requesting match %s, numReady: %s, requests: %s', match_id, Object.keys(steamObj).length, matchRequests);
    matchRequests += 1;
    steamObj[idx].matches += 1;
    if (matchRequests > 500 && getUptime() > minUpTimeSeconds && config.NODE_ENV !== 'development') {
      return selfDestruct();
    }
    const timeout = setTimeout(() => {
      timeouts += 1;
    }, timeoutMs);
    Dota2.requestMatchDetails(Number(match_id), (err, matchData) => {
      clearTimeout(timeout);
      cb(err, matchData);
    });
  }

  function selfDestruct() {
    process.exit(0);
  }

  function getUptime() {
    return (new Date() - launch) / 1000;
  }
}
