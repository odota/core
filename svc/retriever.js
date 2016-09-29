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
const port = config.PORT || config.RETRIEVER_PORT;
let replayRequests = 0;
let count = 0;
let users = config.STEAM_USER.split(',');
let passes = config.STEAM_PASS.split(',');
if (config.PROVIDER === 'gce' && config.STEAM_USER_DATA && config.STEAM_PASS_DATA) {
  const userData = cp.execSync(`curl '${config.STEAM_USER_DATA}'`).toString().split(/\r\n|\r|\n/g);
  const passData = cp.execSync(`curl '${config.STEAM_PASS_DATA}'`).toString().split(/\r\n|\r|\n/g);
  const accountsToUse = Math.min(userData.length, 10);
  const startIndex = Math.floor((Math.random() * userData.length - accountsToUse));
  console.log("total registered accounts: %s, startIndex: %s", userData.length, startIndex);
  users = userData.slice(startIndex, accountsToUse);
  passes = passData.slice(startIndex, accountsToUse);
}
app.use((req, res, next) => {
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    // reject request if it doesn't have key
    return next('invalid key');
  } else {
    next(null);
  }
});
app.get('/', (req, res, next) => {
  // console.log(process.memoryUsage());
  const keys = Object.keys(steamObj);
  if (keys.length == 0) return next('No accounts ready');
  const r = keys[Math.floor((Math.random() * keys.length))];
  if (req.query.mmstats) {
    getMMStats(r, (err, data) => {
      res.locals.data = data;
      return next(err);
    });
  } else if (req.query.match_id) {
    getGCReplayUrl(r, req.query.match_id, (err, data) => {
      res.locals.data = data;
      return next(err);
    });
  } else if (req.query.account_id) {
    getPlayerProfile(r, req.query.account_id, (err, data) => {
      res.locals.data = data;
      return next(err);
    });
  } else {
    res.locals.data = genStats();
    return next();
  }
});
app.use((req, res) => {
  res.json(res.locals.data);
});
app.use((err, req, res, next) => {
  return res.status(500).json({
    error: err,
  });
});
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
    'account_name': user,
    'password': pass,
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
    console.log('[STEAM] Logged on %s', client.steamID);
    client.steamFriends.setPersonaName(client.steamID.toString());
    client.replays = 0;
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
      replays: steamObj[key].replays,
      profiles: steamObj[key].profiles,
      friends: Object.keys(steamObj[key].steamFriends.friends).length,
    };
  }
  const data = {
    replayRequests,
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
  /*
  Dota2.requestProfile(account_id, false, function(err, profileData) {
      //console.log(err, profileData);
      cb(err, profileData.game_account_client);
  });
  */
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

function getGCReplayUrl(idx, match_id, cb) {
  match_id = Number(match_id);
  const Dota2 = steamObj[idx].Dota2;
  console.log('[DOTA] requesting replay %s, numusers: %s, requests: %s', match_id, users.length, replayRequests);
  replayRequests += 1;
  if (replayRequests >= 500 && getUptime() > 600 && config.NODE_ENV !== 'development') {
    selfDestruct();
  }
  steamObj[idx].replays += 1;
  Dota2.requestMatchDetails(match_id, (err, matchData) => {
    // console.log(err, matchData);
    cb(err, matchData);
  });
}

function selfDestruct() {
  if (config.PROVIDER === 'gce') {
    cp.execSync('gcloud compute instances delete $(hostname) --quiet');
  }
  process.exit(0);
}

function getUptime() {
  return (new Date() - launch) / 1000;
}
