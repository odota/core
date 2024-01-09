/**
 * Deployed in the cloud to get data from the Steam GC.
 * Provides HTTP endpoints for other workers.
 * Approx limits: 100 per account per day, 500 per IP per day
 * */
import SteamUser from 'steam-user';
import express from 'express';
import compression from 'compression';
import os from 'os';
import config from '../config';
import ProtoBuf from 'protobufjs';
import axios from 'axios';

const app = express();
const steamObj: Record<string, SteamUser> = {};
let users = config.STEAM_USER.split(',');
let passes = config.STEAM_PASS.split(',');
const minUpTimeSeconds = 180;
const maxAccounts = 5;
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
const DOTA_APPID = 570;

const root = new ProtoBuf.Root();
const builder = root.loadSync(
  [
    './proto/gcsystemmsgs.proto',
    './proto/enums_clientserver.proto',
    './proto/dota_gcmessages_msgid.proto',
    './proto/dota_gcmessages_client.proto',
  ],
  {
    keepCase: true,
  },
);
const EGCBaseClientMsg = builder.lookupEnum('EGCBaseClientMsg');
const EDOTAGCMsg = builder.lookupEnum('EDOTAGCMsg');
const CMsgClientToGCGetProfileCard = builder.lookupType('CMsgClientToGCGetProfileCard');
const CMsgDOTAProfileCard = builder.lookupType('CMsgDOTAProfileCard');
const CMsgGCMatchDetailsRequest = builder.lookupType('CMsgGCMatchDetailsRequest');
const CMsgGCMatchDetailsResponse = builder.lookupType('CMsgGCMatchDetailsResponse');

setInterval(() => {
  const shouldRestart =
  // (matchSuccesses / matchRequests < 0.1 && matchRequests > 100 && getUptime() > minUpTimeSeconds) ||
  (matchRequests > Object.keys(steamObj).length * 110 &&
    getUptime() > minUpTimeSeconds) ||
  (noneReady() && getUptime() > minUpTimeSeconds);
  if (shouldRestart && config.NODE_ENV !== 'development') {
    return selfDestruct();
  }
}, 10000);


app.use(compression());
app.get('/healthz', (req, res, cb) => {
  if (noneReady()) {
    return cb('not ready');
  }
  return res.end('ok');
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
  if (config.RETRIEVER_SECRET && config.RETRIEVER_SECRET !== req.query.key) {
    // reject request if it doesn't have key
    return cb('invalid key');
  }
  if (noneReady()) {
    return cb('not ready');
  }
  return cb();
});
app.get('/stats', async (req, res, cb) => {
  return res.json(genStats());
});
app.get('/profile/:account_id', async (req, res, cb) => {
  const keys = Object.keys(steamObj);
  const rKey = keys[Math.floor(Math.random() * keys.length)];
  const accountId = req.params.account_id;
  const client = steamObj[rKey];
  profileRequests += 1;
  client.sendToGC(
    DOTA_APPID,
    EDOTAGCMsg.values.k_EMsgClientToGCGetProfileCard,
    {},
    Buffer.from(CMsgClientToGCGetProfileCard.encode({ account_id: Number(accountId) }).finish()),
    (appid, msgType, payload) => {
      // console.log(appid, msgType, payload);
      const profileCard = CMsgDOTAProfileCard.decode(payload);
      return res.json(profileCard);
    },
  );
});
app.get('/match/:match_id', async (req, res, cb) => {
  const keys = Object.keys(steamObj);
  const rKey = keys[Math.floor(Math.random() * keys.length)];
  const matchId = req.params.match_id;
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
  const client = steamObj[rKey];
  matchRequests += 1;
  extraMatchRequestInterval += matchRequestIntervalStep;
  console.time('match:' + matchId);
  client.sendToGC(
    DOTA_APPID,
    EDOTAGCMsg.values.k_EMsgGCMatchDetailsRequest,
    {},
    Buffer.from(CMsgGCMatchDetailsRequest.encode({ match_id: Number(matchId) }).finish()),
    (appid, msgType, payload) => {
      console.timeEnd('match:' + matchId);
      const matchData: any = CMsgGCMatchDetailsResponse.decode(payload);
      if (matchData.result === 15) {
        // Valve is blocking GC access to this match, probably a community prediction match
        // Return a 200 success code with specific format, so we treat it as an unretryable error
        return res.json({ result: { status: matchData.result } });
      }
      matchSuccesses += 1;
      matchSuccessAccount[rKey] += 1;
      // Reset delay on success
      extraMatchRequestInterval = 0;
      return res.json(matchData);
    },
  );
});
app.get('/aliases/:steam_ids', async (req, res, cb) => {
  // example: 76561198048632981
  try {
    const keys = Object.keys(steamObj);
    const rKey = keys[Math.floor(Math.random() * keys.length)];
    const aliases = await steamObj[rKey].getAliases(req.params.steam_ids?.split(','));
    return res.json(aliases);
  } catch (e) {
    cb(e);
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
  if (config.STEAM_ACCOUNT_DATA) {
    const resp = await axios.get<string>(config.STEAM_ACCOUNT_DATA, {
      responseType: 'text',
    });
    const accountData = resp.data.split(/\r\n|\r|\n/g);
    users = accountData.map((a) => a.split('\t')[0]);
    passes = accountData.map((a) => a.split('\t')[1]);
  }
  const accountsToUse = Math.min(maxAccounts, users.length);
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
            // Launch Dota 2
            client.gamesPlayed(DOTA_APPID);
          });
          client.on('appLaunched', (appid) => {
            client.sendToGC(
              appid,
              EGCBaseClientMsg.values.k_EMsgGCClientHello,
              {},
              Buffer.alloc(0)
            );
          });
          client.on('receivedFromGC', (appid, msgType, payload) => {
            // We'll get Hello response here
            console.log(
              `Received message ${msgType} from GC ${appid} with ${payload.length} bytes`,
            );
            if (msgType === EGCBaseClientMsg.values.k_EMsgGCClientWelcome) {
              if (!client.steamID) {
                reject('client not connected');
                return;
              }
              console.log(
                'ready: %s (%s)',
                logOnDetails.accountName,
                client.steamID.toString(),
              );
              steamObj[client.steamID.toString()] = client;
              if (!matchSuccessAccount[client.steamID.toString()]) {
                matchSuccessAccount[client.steamID.toString()] = 0;
              }
              resolve();
            }
            // We can also handle other GC responses here if not using callbacks
          });
          client.on('error', (err: any) => {
            console.error(err);
            reject(err);
          });
          client.logOn(logOnDetails);
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
