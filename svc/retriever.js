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
const launch = new Date();
const minUpTimeSeconds = config.PROVIDER === 'gce' ? 0 : 610;
const maxUpTimeSeconds = 3600;
const matchRequestDelay = 100;
const timeoutMs = 15000;
const accountsToUse = 15;
const port = config.PORT || config.RETRIEVER_PORT;
let lastRequestTime;
let matchRequests = 0;
let timeouts = 0;
let count = 0;
let users = config.STEAM_USER.split(',');
let passes = config.STEAM_PASS.split(',');

function selfDestruct() {
  process.exit(0);
}

function getUptime() {
  return (new Date() - launch) / 1000;
}

function genStats() {
  /*
  const stats = {};
  Object.keys(steamObj).forEach(key => {
    stats[key] = {
      steamID: key,
      matches: steamObj[key].matches,
      profiles: steamObj[key].profiles,
      friends: Object.keys(steamObj[key].steamFriends.friends).length,
    };
  });
  */
  const data = {
    matchRequests,
    uptime: getUptime(),
    numReadyAccounts: Object.keys(steamObj).length,
    totalAccounts: users.length,
  };
  return data;
}

function getMMStats(idx, cb) {
  steamObj[idx].Dota2.requestMatchmakingStats();
  steamObj[idx].Dota2.once('matchmakingStatsData', (waitTimes, searchingPlayers, disabledGroups) => {
    if (disabledGroups) {
      cb(null, disabledGroups.legacy_searching_players_by_group_source2);
    } else {
      cb('error mmstats');
    }
  });
}

function getPlayerProfile(idx, accountId, cb) {
  accountId = Number(accountId);
  const Dota2 = steamObj[idx].Dota2;
  console.log('requesting player profile %s', accountId);
  steamObj[idx].profiles += 1;
  Dota2.requestProfileCard(accountId, (err, profileData) => {
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
    return cb(err, response);
  });
}

function getGcMatchData(idx, matchId, cb) {
  const Dota2 = steamObj[idx].Dota2;
  console.log('requesting match %s, numReady: %s, requests: %s, uptime: %s', matchId, Object.keys(steamObj).length, matchRequests, getUptime());
  matchRequests += 1;
  steamObj[idx].matches += 1;
  const shouldRestart = (matchRequests > 500 && getUptime() > minUpTimeSeconds) ||
    getUptime() > maxUpTimeSeconds;
  if (shouldRestart && config.NODE_ENV !== 'development') {
    return selfDestruct();
  }
  const timeout = setTimeout(() => {
    timeouts += 1;
  }, timeoutMs);
  return Dota2.requestMatchDetails(Number(matchId), (err, matchData) => {
    console.log('received match %s', matchId);
    clearTimeout(timeout);
    cb(err, matchData);
  });
}

function login() {
  async.each(Array.from(new Array(users.length), (v, i) => i), (i, cb) => {
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
    client.on('error', (err) => {
      console.error(err);
    });
    client.on('logOnResponse', (logOnResponse) => {
      console.log(logOnResponse);
    });
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
          count += 1;
          console.log('acct %s ready, %s/%s', i, count, users.length);
          cb();
        });
        client.Dota2.launch();
        client.once('loggedOff', () => {
          console.log('relogging');
          client.steamUser.logOn(logOnDetails);
        });
      }
      return null;
    });
  });
}

function relog() {
  Object.keys(steamObj).forEach((steamId) => {
    steamObj[steamId].disconnect();
  });
  login();
  timeouts = 0;
}

if (config.STEAM_ACCOUNT_DATA) {
  const accountData = cp.execSync(`curl '${config.STEAM_ACCOUNT_DATA}'`).toString().split(/\r\n|\r|\n/g);
  const startIndex = Math.floor((Math.random() * (accountData.length - accountsToUse)));
  console.log('total registered accounts: %s, startIndex: %s', accountData.length, startIndex);
  const accountDataToUse = accountData.slice(startIndex, startIndex + accountsToUse);
  users = accountDataToUse.map(a => a.split('\t')[0]);
  passes = accountDataToUse.map(a => a.split('\t')[1]);
}
console.log(users, passes);
login();

app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.use((req, res, cb) => {
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    // reject request if it doesn't have key
    return cb('invalid key');
  }
  return cb();
});
app.get('/', (req, res, cb) => {
  const keys = Object.keys(steamObj);
  if (!keys.length) {
    return cb('No accounts ready');
  }
  const r = keys[Math.floor((Math.random() * keys.length))];
  if (req.query.mmstats) {
    return getMMStats(r, (err, data) => {
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
      return relog();
      /*
      // If we keep timing out, stop making requests
      if (getUptime() > minUpTimeSeconds) {
        return selfDestruct();
      }
      return cb('timeout count threshold exceeded');
      */
    }
    lastRequestTime = curRequestTime;
    return getGcMatchData(r, req.query.match_id, (err, data) => {
      res.locals.data = data;
      return cb(err);
    });
  } else if (req.query.account_id) {
    return getPlayerProfile(r, req.query.account_id, (err, data) => {
      res.locals.data = data;
      return cb(err);
    });
  }
  res.locals.data = genStats();
  return cb();
});
app.use((req, res) => {
  res.json(res.locals.data);
});
app.use((err, req, res) =>
  res.status(500).json({
    error: err,
  })
);
const server = app.listen(port, () => {
  const host = server.address().address;
  console.log('[RETRIEVER] listening at http://%s:%s', host, port);
});
