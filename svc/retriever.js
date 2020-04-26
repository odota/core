/**
 * Worker interfacing with the Steam GC.
 * Provides HTTP endpoints for other workers.
 * */
const Steam = require('steam');
const Dota2 = require('dota2');
const async = require('async');
const express = require('express');
const compression = require('compression');
const cp = require('child_process');
const config = require('../config');

const advancedAuth = config.ENABLE_RETRIEVER_ADVANCED_AUTH ? {
  /* eslint-disable global-require */
  redis: require('../store/redis'),
  crypto: require('crypto'),
  /* eslint-enable global-require */
  pendingTwoFactorAuth: {},
  pendingSteamGuardAuth: {},
} : null;

const app = express();
const steamObj = {};
const launch = new Date();
const minUpTimeSeconds = 660;
const maxUpTimeSeconds = 3600;
const timeoutMs = 1500;
const successThreshold = 0.5;
const accountsToUse = 5;
const matchRequestLimit = 500;
const port = config.PORT || config.RETRIEVER_PORT;
const matchRequestDelay = 1000;
const matchRequestDelayStep = 200;

let matchRequestDelayIncr = 0;
let lastRequestTime;
let matchRequests = 0;
let matchSuccesses = 0;
let profileRequests = 0;
let profileSuccesses = 0;
let allReady = false;
let users = config.STEAM_USER.split(',');
let passes = config.STEAM_PASS.split(',');

// For the latest list: https://api.steampowered.com/ISteamDirectory/GetCMList/v1/?format=json&cellid=0
Steam.servers = [{ host: '155.133.242.9', port: 27018 }, { host: '185.25.180.15', port: 27019 }, { host: '185.25.180.15', port: 27018 }, { host: '185.25.180.14', port: 27017 }, { host: '185.25.180.15', port: 27017 }, { host: '155.133.242.9', port: 27019 }, { host: '155.133.242.9', port: 27017 }, { host: '185.25.180.14', port: 27018 }, { host: '185.25.180.14', port: 27019 }, { host: '155.133.242.8', port: 27017 }, { host: '155.133.242.8', port: 27018 }, { host: '155.133.242.8', port: 27019 }, { host: '162.254.197.40', port: 27018 }, { host: '155.133.248.50', port: 27017 }, { host: '155.133.248.51', port: 27017 }, { host: '162.254.196.68', port: 27017 }, { host: '162.254.197.41', port: 27017 }, { host: '162.254.196.67', port: 27019 }, { host: '155.133.248.53', port: 27018 }, { host: '155.133.248.52', port: 27018 }, { host: '162.254.196.67', port: 27017 }, { host: '162.254.196.67', port: 27018 }, { host: '162.254.196.83', port: 27017 }, { host: '162.254.196.84', port: 27017 }, { host: '155.133.248.52', port: 27017 }, { host: '162.254.196.68', port: 27018 }, { host: '162.254.197.40', port: 27019 }, { host: '155.133.248.51', port: 27019 }, { host: '155.133.248.52', port: 27019 }, { host: '155.133.248.53', port: 27019 }, { host: '155.133.248.50', port: 27019 }, { host: '155.133.248.53', port: 27017 }, { host: '162.254.196.68', port: 27019 }, { host: '162.254.197.42', port: 27019 }, { host: '162.254.196.84', port: 27018 }, { host: '155.133.248.50', port: 27018 }, { host: '162.254.196.83', port: 27019 }, { host: '162.254.197.42', port: 27018 }, { host: '162.254.197.41', port: 27018 }, { host: '162.254.196.84', port: 27019 }, { host: '162.254.196.83', port: 27018 }, { host: '162.254.197.40', port: 27017 }, { host: '162.254.197.41', port: 27019 }, { host: '155.133.248.51', port: 27018 }, { host: '162.254.197.42', port: 27017 }, { host: '146.66.152.11', port: 27018 }, { host: '146.66.152.11', port: 27019 }, { host: '146.66.152.11', port: 27017 }, { host: '146.66.152.10', port: 27019 }, { host: '146.66.152.10', port: 27017 }, { host: '146.66.152.10', port: 27018 }, { host: '208.78.164.10', port: 27018 }, { host: '208.78.164.9', port: 27019 }, { host: '208.78.164.13', port: 27018 }, { host: '208.78.164.9', port: 27017 }, { host: '208.78.164.12', port: 27018 }, { host: '208.78.164.10', port: 27017 }, { host: '155.133.229.251', port: 27019 }, { host: '155.133.229.251', port: 27017 }, { host: '208.78.164.14', port: 27018 }, { host: '208.78.164.12', port: 27019 }, { host: '208.78.164.13', port: 27017 }, { host: '208.78.164.9', port: 27018 }, { host: '208.78.164.14', port: 27019 }, { host: '208.78.164.11', port: 27018 }, { host: '208.78.164.10', port: 27019 }, { host: '155.133.229.250', port: 27017 }, { host: '208.78.164.12', port: 27017 }, { host: '208.78.164.11', port: 27019 }, { host: '155.133.229.250', port: 27018 }, { host: '155.133.229.251', port: 27018 }, { host: '208.78.164.11', port: 27017 }, { host: '155.133.229.250', port: 27019 }, { host: '208.78.164.13', port: 27019 }, { host: '208.78.164.14', port: 27017 }, { host: '162.254.193.7', port: 27017 }, { host: '162.254.193.47', port: 27019 }, { host: '162.254.193.7', port: 27018 }, { host: '162.254.193.46', port: 27018 }, { host: '162.254.193.6', port: 27017 }];

function selfDestruct() {
  process.exit(0);
}

function getUptime() {
  return (new Date() - launch) / 1000;
}

function genStats() {
  const data = {
    matchRequests,
    matchSuccesses,
    profileRequests,
    profileSuccesses,
    uptime: getUptime(),
    numReadyAccounts: Object.keys(steamObj).length,
    totalAccounts: users.length,
  };
  return data;
}

function shaHash(buffer) {
  const h = advancedAuth.crypto.createHash('sha1');
  h.update(buffer);
  return h.digest();
}

function getSentryHashKey(user) {
  return Buffer.from(`retriever:sentry:${user}`);
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
  const { Dota2 } = steamObj[idx];
  console.log('requesting player profile %s', accountId);
  profileRequests += 1;
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
    const response = { ...profileData };
    profileSuccesses += 1;
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
  const { Dota2 } = steamObj[idx];
  matchRequests += 1;
  const timeout = setTimeout(() => {
    matchRequestDelayIncr += matchRequestDelayStep;
  }, timeoutMs);
  return Dota2.requestMatchDetails(Number(matchId), (err, matchData) => {
    matchSuccesses += 1;
    // Reset delay on success
    matchRequestDelayIncr = 0;
    console.log('received match %s', matchId);
    clearTimeout(timeout);
    cb(err, matchData);
  });
}

function init() {
  async.each(Array.from(new Array(users.length), (v, i) => i), (i, cb) => {
    const client = new Steam.SteamClient();
    const user = users[i];
    const pass = passes[i];
    const logOnDetails = {
      account_name: user,
      password: pass,
    };

    client.steamUser = new Steam.SteamUser(client);
    client.steamFriends = new Steam.SteamFriends(client);
    client.logOnDetails = logOnDetails;
    client.Dota2 = new Dota2.Dota2Client(client, false);
    client.Dota2.on('ready', () => {
      console.log('acct %s ready', i);
      cb();
    });
    client.on('connected', () => {
      console.log('[STEAM] Trying to log on with %s,%s', user, pass);
      client.steamUser.logOn(logOnDetails);
    });
    client.on('logOnResponse', (logOnResp) => {
      if (advancedAuth) {
        delete client.logOnDetails.two_factor_code;
        delete client.logOnDetails.auth_code;
        delete advancedAuth.pendingTwoFactorAuth[user];
        delete advancedAuth.pendingSteamGuardAuth[user];

        const isTwoFactorAuth = logOnResp.eresult === Steam.EResult.AccountLoginDeniedNeedTwoFactor;
        const isSteamGuard = logOnResp.eresult === Steam.EResult.AccountLogonDenied;
        if (isTwoFactorAuth || isSteamGuard) {
          console.log('[STEAM] Account %s is protected', user);
          if (isTwoFactorAuth) {
            console.log('[STEAM] Two Factor Authentication required.');
            advancedAuth.pendingTwoFactorAuth[user] = client;
          } else {
            console.log('[STEAM] SteamGuard Authentication required.');
            advancedAuth.pendingSteamGuardAuth[user] = client;
          }

          return;
        }
      }

      if (logOnResp.eresult !== Steam.EResult.OK) {
        // try logging on again
        console.error(logOnResp);
        client.steamUser.logOn(logOnDetails);
        return;
      }

      if (client && client.steamID) {
        console.log('[STEAM] Logged on %s', client.steamID);
        client.steamFriends.setPersonaName(client.steamID.toString());
        steamObj[client.steamID] = client;
        client.Dota2.launch();
      }
    });
    client.steamUser.on('updateMachineAuth', (machineAuth, callback) => {
      console.log('[STEAM] Got UpdateMachineAuth for %s', user);

      if (advancedAuth) {
        const key = getSentryHashKey(user);
        advancedAuth.redis.hgetall(key, (err, sentries) => {
          const size = machineAuth.offset + machineAuth.cubtowrite;
          let newSentry;
          if (sentries && machineAuth.filename in sentries) {
            newSentry = sentries[machineAuth.filename];
            if (size > newSentry.size) {
              const temp = Buffer.alloc(size);
              newSentry.copy(temp);
              newSentry = temp;
            }
          } else {
            newSentry = Buffer.alloc(size);
          }
          machineAuth.bytes.copy(newSentry, machineAuth.offset, 0, machineAuth.cubtowrite);

          advancedAuth.redis.multi()
            .del(key)
            .hset(key, machineAuth.filename, newSentry)
            .exec();

          const sha = shaHash(newSentry);
          client.logOnDetails.sha_sentryfile = sha;

          callback({
            filename: machineAuth.filename,
            eresult: Steam.EResult.OK,
            filesize: newSentry.length,
            sha_file: sha,
            getlasterror: 0,
            offset: machineAuth.offset,
            cubwrote: machineAuth.cubtowrite,
            otp_type: machineAuth.otp_type,
            otp_identifier: machineAuth.otp_identifier,
          });
        });
      }
    });
    client.on('error', (err) => {
      console.error(err);
      if (advancedAuth && (
        user in advancedAuth.pendingTwoFactorAuth
        || user in advancedAuth.pendingSteamGuardAuth)) {
        console.log('not reconnecting %s, waiting for auth...', user);
        client.pendingLogOn = true;
      } else {
        // console.log('reconnecting %s', user);
        // client.connect();
      }
    });

    if (advancedAuth) {
      advancedAuth.redis.hgetall(getSentryHashKey(user), (err, sentries) => {
        if (sentries) {
          Object.keys(sentries).some((k) => {
            if (sentries[k] && sentries[k].length > 0) {
              const sha = shaHash(sentries[k]);
              console.log('Retrieved sentry for %s: %s', user, sha.toString('hex'));

              logOnDetails.sha_sentryfile = sha;
              return true;
            }

            return false;
          });
        }

        client.connect();
      });
    } else {
      client.connect();
    }

    /*
    client.on('loggedOff', () => {
      console.log('relogging');
      setTimeout(()=> {
        client.steamUser.logOn(logOnDetails)
      }, 5000);
    });
    */
  }, () => {
    allReady = true;
  });
}

function chooseLoginInfo() {
  if (config.STEAM_ACCOUNT_DATA) {
    const accountData = cp.execSync(`curl '${config.STEAM_ACCOUNT_DATA}'`).toString().split(/\r\n|\r|\n/g);
    const startIndex = Math.floor((Math.random() * (accountData.length - accountsToUse)));
    console.log('total registered accounts: %s, startIndex: %s', accountData.length, startIndex);
    const accountDataToUse = accountData.slice(startIndex, startIndex + accountsToUse);
    users = accountDataToUse.map(a => a.split('\t')[0]);
    passes = accountDataToUse.map(a => a.split('\t')[1]);
  }
}

chooseLoginInfo();
init();

app.use(compression());
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
if (advancedAuth) {
  app.get('/auth', (req, res) => {
    if (req.query.account) {
      if (req.query.two_factor) {
        const client = advancedAuth.pendingTwoFactorAuth[req.query.account];
        if (client && client.pendingLogOn) {
          client.logOnDetails.two_factor_code = req.query.two_factor;
          delete client.logOnDetails.sha_sentryfile;

          client.connect();
          delete client.pendingLogOn;

          return res.json({
            result: 'success',
          });
        }

        return res.status(400).json({
          error: 'account not pending a two-factor authentication',
        });
      }

      if (req.query.steam_guard) {
        const client = advancedAuth.pendingSteamGuardAuth[req.query.account];
        if (client && client.pendingLogOn) {
          client.logOnDetails.auth_code = req.query.steam_guard;
          delete client.logOnDetails.sha_sentryfile;

          client.connect();
          delete client.pendingLogOn;

          return res.json({
            result: 'success',
          });
        }

        return res.status(400).json({
          error: 'account not pending a SteamGuard authentication',
        });
      }

      return res.status(400).json({
        error: 'missing two_factor or steam_guard parameter',
      });
    }

    return res.json({
      twoFactorAuth: Object.keys(advancedAuth.pendingTwoFactorAuth),
      steamGuardAuth: Object.keys(advancedAuth.pendingSteamGuardAuth),
    });
  });
}
app.use((req, res, cb) => {
  console.log(
    'numReady: %s, matches: %s/%s, profiles: %s/%s, uptime: %s, matchRequestDelay: %s',
    Object.keys(steamObj).length,
    matchSuccesses,
    matchRequests,
    profileSuccesses,
    profileRequests,
    getUptime(),
    matchRequestDelay + matchRequestDelayIncr,
  );
  const shouldRestart = (matchRequests > matchRequestLimit && getUptime() > minUpTimeSeconds)
    || getUptime() > maxUpTimeSeconds
    || (!allReady && getUptime() > minUpTimeSeconds)
    || (matchSuccesses / matchRequests < successThreshold && getUptime() > minUpTimeSeconds);
  if (shouldRestart && config.NODE_ENV !== 'development') {
    return selfDestruct();
  }
  if (!allReady) {
    return cb('not ready');
  }
  return cb();
});
app.get('/', (req, res, cb) => {
  const keys = Object.keys(steamObj);
  const rKey = keys[Math.floor((Math.random() * keys.length))];
  if (req.query.mmstats) {
    return getMMStats(rKey, (err, data) => {
      res.locals.data = data;
      return cb(err);
    });
  } if (req.query.match_id) {
    // Don't allow requests coming in too fast
    const curRequestTime = new Date();
    if (matchRequests > matchRequestLimit) {
      return res.status(403).json({ error: 'match request limit exceeded' });
    }
    if (lastRequestTime
      && (curRequestTime - lastRequestTime < (matchRequestDelay + matchRequestDelayIncr))) {
      return res.status(429).json({
        error: 'too many requests',
      });
    }
    lastRequestTime = curRequestTime;
    return getGcMatchData(rKey, req.query.match_id, (err, data) => {
      res.locals.data = data;
      return cb(err);
    });
  } if (req.query.account_id) {
    return getPlayerProfile(rKey, req.query.account_id, (err, data) => {
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
app.use((err, req, res) => res.status(500).json({
  error: err,
}));
const server = app.listen(port, () => {
  const host = server.address().address;
  console.log('[RETRIEVER] listening at http://%s:%s', host, port);
});
