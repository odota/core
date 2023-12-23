/**
 * Deployed in the cloud to get data from the Steam GC.
 * Provides HTTP endpoints for other workers.
 * */
import Steam from 'steam';
import Dota2 from 'dota2';
import express from 'express';
import compression from 'compression';
import cp from 'child_process';
import os from 'os';
import config from '../config';
import axios from 'axios';

const app = express();
const steamObj: { [key: string]: any } = {};
let users = config.STEAM_USER.split(',');
let passes = config.STEAM_PASS.split(',');
if (config.STEAM_ACCOUNT_DATA) {
  const accountData = cp
    .execSync(`curl '${config.STEAM_ACCOUNT_DATA}'`, {
      maxBuffer: 8 * 1024 * 1024,
    })
    .toString()
    .split(/\r\n|\r|\n/g);
  users = accountData.map((a) => a.split('\t')[0]);
  passes = accountData.map((a) => a.split('\t')[1]);
}
const minUpTimeSeconds = 300;
const timeoutMs = 5000;
// maybe 200 per account?
const accountsToUse = Math.min(5, users.length);
// maybe can do 1000 per IP now?
const matchRequestLimit = 600;
const port = config.PORT || config.RETRIEVER_PORT;
const matchRequestDelay = 1000;
const matchRequestDelayStep = 1;
const noneReady = () => Object.keys(steamObj).length === 0;
let matchRequestDelayIncr = 0;
let lastRequestTime: number | null = null;
let matchRequests = 0;
let matchSuccesses = 0;
let profileRequests = 0;
let profileSuccesses = 0;

app.use(compression());
app.get('/healthz', (req, res, cb) => {
  if (noneReady()) {
    return cb('not ready');
  }
  return res.end('ok');
});
app.use((req, res, cb) => {
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    // reject request if it doesn't have key
    return cb('invalid key');
  }
  return cb();
});
app.use((req, res, cb) => {
  console.log(
    'numReady: %s, matches: %s/%s, profiles: %s/%s, uptime: %s, matchRequestDelay: %s, query: %s',
    Object.keys(steamObj).length,
    matchSuccesses,
    matchRequests,
    profileSuccesses,
    profileRequests,
    getUptime(),
    matchRequestDelay + matchRequestDelayIncr,
    req.query,
  );
  const shouldRestart =
    // (matchSuccesses / matchRequests < 0.1 && matchRequests > 100 && getUptime() > minUpTimeSeconds) ||
    (matchRequests > matchRequestLimit && getUptime() > minUpTimeSeconds) ||
    (noneReady() && getUptime() > minUpTimeSeconds);
  if (shouldRestart && config.NODE_ENV !== 'development') {
    return selfDestruct();
  }
  if (noneReady()) {
    return cb('not ready');
  }
  return cb();
});
app.get('/', (req, res, cb) => {
  const keys = Object.keys(steamObj);
  const rKey = keys[Math.floor(Math.random() * keys.length)];
  if (req.query.match_id) {
    // Don't allow requests coming in too fast
    const curRequestTime = Number(new Date());
    if (matchRequests > matchRequestLimit) {
      return res.status(403).json({ error: 'match request limit exceeded' });
    }
    if (
      lastRequestTime &&
      curRequestTime - lastRequestTime <
        matchRequestDelay + matchRequestDelayIncr
    ) {
      return res.status(429).json({
        error: 'too many requests',
      });
    }
    lastRequestTime = curRequestTime;
    getGcMatchData(
      rKey,
      req.query.match_id as string,
      (err: any, data: any) => {
        if (err) {
          return cb(err);
        }
        return res.json(data);
      },
    );
  } else if (req.query.account_id) {
    getPlayerProfile(
      rKey,
      req.query.account_id as string,
      (err: any, data: any) => {
        if (err) {
          return cb(err);
        }
        return res.json(data);
      },
    );
  } else {
    return res.json(genStats());
  }
});
app.use((err: Error, req: express.Request, res: express.Response) => {
  return res.status(500).json({
    error: err,
  });
});

async function start() {
  Steam.servers = await getSteamServers();
  init();
  app.listen(port, () => {
    console.log('[RETRIEVER] listening on %s', port);
  });
}
start();

async function init() {
  // Some logins may fail, and sometimes the Steam CM never returns a response
  // So don't await this and we'll just make sure we have at least one working with noneReady
  const logOns = Array.from(new Array(accountsToUse), (v, i) =>
    chooseLoginInfo(),
  );
  await Promise.allSettled(
    logOns.map(
      (logOnDetails) =>
        new Promise<void>((resolve, reject) => {
          const client = new Steam.SteamClient();
          client.steamUser = new Steam.SteamUser(client);
          // client.steamFriends = new Steam.SteamFriends(client);
          client.Dota2 = new Dota2.Dota2Client(client, false);
          client.Dota2.on('ready', () => {
            console.log('%s ready', logOnDetails.account_name);
            steamObj[client.steamID] = client;
            resolve();
          });
          client.on('connected', () => {
            console.log(
              '[STEAM] Trying to log on with %s',
              JSON.stringify(logOnDetails),
            );
            client.steamUser.logOn(logOnDetails);
          });
          client.on('logOnResponse', (logOnResp: any) => {
            if (logOnResp.eresult !== Steam.EResult.OK) {
              console.error(logOnResp);
              reject(logOnResp.eresult);
              // we can try again, but some errors are non-retryable
              // client.connect();
            } else if (client && client.steamID) {
              console.log('[STEAM] Logged on %s', client.steamID);
              // client.steamFriends.setPersonaName(client.steamID.toString());
              client.Dota2.launch();
            }
          });
          client.on('error', (err: any) => {
            console.error(err);
          });
          client.on('loggedOff', () => {
            console.log('relogging %s', JSON.stringify(logOnDetails));
            setTimeout(() => {
              client.steamUser.logOn(logOnDetails);
            }, 5000);
          });
          client.connect();
        }),
    ),
  );
}
function selfDestruct() {
  console.log('shutting down');
  process.exit(0);
}
function getUptime() {
  return process.uptime();
}
function getServerUptime() {
  return os.uptime();
}
function genStats() {
  const data = {
    matchRequests,
    matchSuccesses,
    profileRequests,
    profileSuccesses,
    uptime: getUptime(),
    serverUptime: getServerUptime(),
    hostname: os.hostname(),
    numReadyAccounts: Object.keys(steamObj).length,
    totalAccounts: users.length,
  };
  return data;
}
function getPlayerProfile(idx: string, accountId: string, cb: ErrorCb) {
  const { Dota2 } = steamObj[idx];
  // console.log("requesting player profile %s", accountId);
  profileRequests += 1;
  Dota2.requestProfileCard(Number(accountId), (err: any, profileData: any) => {
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
    profileData.slots.forEach((s: any) => {
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
function getGcMatchData(idx: string, matchId: string, cb: ErrorCb) {
  const { Dota2 } = steamObj[idx];
  matchRequests += 1;
  const start = Date.now();
  const timeout = setTimeout(() => {
    matchRequestDelayIncr += matchRequestDelayStep;
  }, timeoutMs);
  return Dota2.requestMatchDetails(
    Number(matchId),
    (err: any, matchData: any) => {
      if (matchData.result === 15) {
        // Valve is blocking GC access to this match, probably a community prediction match
        // Return a 200 success code with specific format, so we treat it as an unretryable error
        return cb(null, { result: { status: matchData.result } });
      }
      matchSuccesses += 1;
      const end = Date.now();
      // Reset delay on success
      matchRequestDelayIncr = 0;
      console.log('received match %s in %sms', matchId, end - start);
      clearTimeout(timeout);
      return cb(err, matchData);
    },
  );
}
/**
 * Chooses a random login to use from the pool. Once selected, removes it from the list
 * @returns
 */
function chooseLoginInfo() {
  const startIndex = Math.floor(Math.random() * users.length);
  return {
    account_name: users.splice(startIndex, 1)[0],
    password: passes.splice(startIndex, 1)[0],
  };
}
async function getSteamServers() {
  // For the latest list: https://api.steampowered.com/ISteamDirectory/GetCMList/v1/?format=json&cellid=0
  try {
    const cmResp = await axios.get(
      'https://api.steampowered.com/ISteamDirectory/GetCMList/v1/?format=json&cellid=0',
    );
    const cmList = cmResp.data.response.serverlist;
    return cmList.map((cm: string) => {
      const spl = cm.split(':');
      return { host: spl[0], port: spl[1] };
    });
  } catch (e) {
    console.error(e);
  }
  // Just use the default list (this might be slower due to non-working values)
  return [
    { host: '155.133.242.9', port: 27018 },
    { host: '185.25.180.15', port: 27019 },
    { host: '185.25.180.15', port: 27018 },
    { host: '185.25.180.14', port: 27017 },
    { host: '185.25.180.15', port: 27017 },
    { host: '155.133.242.9', port: 27019 },
    { host: '155.133.242.9', port: 27017 },
    { host: '185.25.180.14', port: 27018 },
    { host: '185.25.180.14', port: 27019 },
    { host: '155.133.242.8', port: 27017 },
    { host: '155.133.242.8', port: 27018 },
    { host: '155.133.242.8', port: 27019 },
    { host: '162.254.197.40', port: 27018 },
    { host: '155.133.248.50', port: 27017 },
    { host: '155.133.248.51', port: 27017 },
    { host: '162.254.196.68', port: 27017 },
    { host: '162.254.197.41', port: 27017 },
    { host: '162.254.196.67', port: 27019 },
    { host: '155.133.248.53', port: 27018 },
    { host: '155.133.248.52', port: 27018 },
    { host: '162.254.196.67', port: 27017 },
    { host: '162.254.196.67', port: 27018 },
    { host: '162.254.196.83', port: 27017 },
    { host: '162.254.196.84', port: 27017 },
    { host: '155.133.248.52', port: 27017 },
    { host: '162.254.196.68', port: 27018 },
    { host: '162.254.197.40', port: 27019 },
    { host: '155.133.248.51', port: 27019 },
    { host: '155.133.248.52', port: 27019 },
    { host: '155.133.248.53', port: 27019 },
    { host: '155.133.248.50', port: 27019 },
    { host: '155.133.248.53', port: 27017 },
    { host: '162.254.196.68', port: 27019 },
    { host: '162.254.197.42', port: 27019 },
    { host: '162.254.196.84', port: 27018 },
    { host: '155.133.248.50', port: 27018 },
    { host: '162.254.196.83', port: 27019 },
    { host: '162.254.197.42', port: 27018 },
    { host: '162.254.197.41', port: 27018 },
    { host: '162.254.196.84', port: 27019 },
    { host: '162.254.196.83', port: 27018 },
    { host: '162.254.197.40', port: 27017 },
    { host: '162.254.197.41', port: 27019 },
    { host: '155.133.248.51', port: 27018 },
    { host: '162.254.197.42', port: 27017 },
    { host: '146.66.152.11', port: 27018 },
    { host: '146.66.152.11', port: 27019 },
    { host: '146.66.152.11', port: 27017 },
    { host: '146.66.152.10', port: 27019 },
    { host: '146.66.152.10', port: 27017 },
    { host: '146.66.152.10', port: 27018 },
    { host: '208.78.164.10', port: 27018 },
    { host: '208.78.164.9', port: 27019 },
    { host: '208.78.164.13', port: 27018 },
    { host: '208.78.164.9', port: 27017 },
    { host: '208.78.164.12', port: 27018 },
    { host: '208.78.164.10', port: 27017 },
    { host: '155.133.229.251', port: 27019 },
    { host: '155.133.229.251', port: 27017 },
    { host: '208.78.164.14', port: 27018 },
    { host: '208.78.164.12', port: 27019 },
    { host: '208.78.164.13', port: 27017 },
    { host: '208.78.164.9', port: 27018 },
    { host: '208.78.164.14', port: 27019 },
    { host: '208.78.164.11', port: 27018 },
    { host: '208.78.164.10', port: 27019 },
    { host: '155.133.229.250', port: 27017 },
    { host: '208.78.164.12', port: 27017 },
    { host: '208.78.164.11', port: 27019 },
    { host: '155.133.229.250', port: 27018 },
    { host: '155.133.229.251', port: 27018 },
    { host: '208.78.164.11', port: 27017 },
    { host: '155.133.229.250', port: 27019 },
    { host: '208.78.164.13', port: 27019 },
    { host: '208.78.164.14', port: 27017 },
    { host: '162.254.193.7', port: 27017 },
    { host: '162.254.193.47', port: 27019 },
    { host: '162.254.193.7', port: 27018 },
    { host: '162.254.193.46', port: 27018 },
    { host: '162.254.193.6', port: 27017 },
  ];
}
