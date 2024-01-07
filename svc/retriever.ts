/**
 * Deployed in the cloud to get data from the Steam GC.
 * Provides HTTP endpoints for other workers.
 * */
import SteamUser from 'steam-user';
import { Dota2User } from 'dota2-user';
import { EDOTAGCMsg } from 'dota2-user/protobufs';
import express from 'express';
import compression from 'compression';
import cp from 'child_process';
import os from 'os';
import config from '../config';

const app = express();
const steamObj: Record<string, any> = {};
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
const minUpTimeSeconds = 180;
const timeoutMs = 5000;
// Approx limits: 100 per account per day, 500 per IP per day
const accountsToUse = Math.min(5, users.length);
const port = config.PORT || config.RETRIEVER_PORT;
const baseMatchRequestInterval = 500;
let extraMatchRequestInterval = 0;
const matchRequestIntervalStep = 0;
const noneReady = () => Object.keys(steamObj).length === 0;
let lastRequestTime: number | null = null;
let matchRequests = 0;
let matchSuccesses = 0;
let profileRequests = 0;
let profileSuccesses = 0;
const matchSuccessAccount: Record<string, number> = {};

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
    baseMatchRequestInterval + extraMatchRequestInterval,
    req.query,
  );
  const shouldRestart =
    // (matchSuccesses / matchRequests < 0.1 && matchRequests > 100 && getUptime() > minUpTimeSeconds) ||
    (matchRequests > Object.keys(steamObj).length * 110 &&
      getUptime() > minUpTimeSeconds) ||
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
    if (
      lastRequestTime &&
      curRequestTime - lastRequestTime <
        baseMatchRequestInterval + extraMatchRequestInterval
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

async function start() {
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
          const client = new SteamUser();
          client.on('loggedOn', () => {
            console.log('[STEAM] Logged on %s', client.steamID);
            client.gamesPlayed(Dota2User.STEAM_APPID);
          });
          client.on('error', (err: any) => {
            console.error(err);
            reject(err);
          });
          client.logOn(logOnDetails);
          const dota2 = new Dota2User(client);
          dota2.on('connectedToGC', () => {
            console.log('ready: %s (%s)', logOnDetails.accountName, client.steamID!.toString());
            steamObj[client.steamID!.toString()] = dota2;
            if (!matchSuccessAccount[client.steamID!.toString()]) {
              matchSuccessAccount[client.steamID!.toString()] = 0;
            }
            resolve();
          });
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
function getOSUptime() {
  return os.uptime();
}
function genStats() {
  const data = {
    matchRequests,
    matchSuccesses,
    profileRequests,
    profileSuccesses,
    uptime: getUptime(),
    osUptime: getOSUptime(),
    hostname: os.hostname(),
    numReadyAccounts: Object.keys(steamObj).length,
    totalAccounts: users.length,
    matchSuccessAccount,
  };
  return data;
}
function getPlayerProfile(idx: string, accountId: string, cb: ErrorCb) {
  const dota2 = steamObj[idx];
  // console.log("requesting player profile %s", accountId);
  profileRequests += 1;
  dota2.send(EDOTAGCMsg.k_EMsgClientToGCGetProfileCard, { accountId: Number(accountId) });
  // TODO need to handle multiple requests and match them to correct responses
  dota2.router.on(EDOTAGCMsg.k_EMsgClientToGCGetProfileCardResponse, (data: any) => {
    profileSuccesses += 1;
    return cb(null, data);
  });
}
function getGcMatchData(idx: string, matchId: string, cb: ErrorCb) {
  const dota2 = steamObj[idx];
  matchRequests += 1;
  const start = Date.now();
  const timeout = setTimeout(() => {
    extraMatchRequestInterval += matchRequestIntervalStep;
  }, timeoutMs);
  dota2.send(EDOTAGCMsg.k_EMsgGCMatchDetailsRequest, { matchId: Number(matchId) });
  // TODO need to handle multiple requests and match them to correct responses
  dota2.router.once(EDOTAGCMsg.k_EMsgGCMatchDetailsResponse, (matchData: any) => {
      if (matchData.result === 15) {
        // Valve is blocking GC access to this match, probably a community prediction match
        // Return a 200 success code with specific format, so we treat it as an unretryable error
        return cb(null, { result: { status: matchData.result } });
      }
      matchSuccesses += 1;
      matchSuccessAccount[idx] += 1;
      const end = Date.now();
      // Reset delay on success
      extraMatchRequestInterval = 0;
      console.log('received match %s in %sms', matchId, end - start);
      clearTimeout(timeout);
      return cb(null, matchData);
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
    accountName: users.splice(startIndex, 1)[0],
    password: passes.splice(startIndex, 1)[0],
  };
}

