/**
 * Gets data from the Steam GC.
 * Provides HTTP endpoints for other workers.
 * Approx limits: 100 per account per day, 500 per IP per day
 * */
import SteamUser from 'steam-user';
import { createServer } from 'node:http';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import config from '../config.ts';
import ProtoBuf from 'protobufjs';

const steamObj: Record<string, SteamUser> = {};

const minUpTimeSeconds = Number(config.RETRIEVER_MIN_UPTIME);
const numAccounts = Number(config.RETRIEVER_NUM_ACCOUNTS);
const matchesPerAccount = 100;
const accountAttemptMax = 5;
const matchRequestInterval = Math.max(
  1000 / numAccounts,
  (minUpTimeSeconds / (numAccounts * matchesPerAccount)) * 1000,
);
const port = config.PORT || config.RETRIEVER_PORT;
const noneReady = () =>
  Object.values(steamObj).filter((client) => client.steamID).length === 0;
let lastMatchRequestTime: number | null = null;
let matchRequests = 0;
let matchSuccesses = 0;
let profileRequests = 0;
let profileSuccesses = 0;
const matchAttempts: Record<string, number> = {};
const DOTA_APPID = 570;
let publicIP = '';

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
const CMsgClientToGCGetProfileCard = builder.lookupType(
  'CMsgClientToGCGetProfileCard',
);
const CMsgDOTAProfileCard = builder.lookupType('CMsgDOTAProfileCard');
const CMsgGCMatchDetailsRequest = builder.lookupType(
  'CMsgGCMatchDetailsRequest',
);
const CMsgGCMatchDetailsResponse = builder.lookupType(
  'CMsgGCMatchDetailsResponse',
);

setInterval(() => {
  const shouldRestart =
    matchRequests >= Object.keys(steamObj).length * matchesPerAccount ||
    matchRequests - matchSuccesses > matchesPerAccount ||
    noneReady();
  if (
    shouldRestart &&
    config.NODE_ENV !== 'development' &&
    getUptime() > minUpTimeSeconds
  ) {
    return selfDestruct();
  }
  // Re-register ourselves as available
  if (config.SERVICE_REGISTRY_HOST && !noneReady()) {
    const registerUrl = `https://${config.SERVICE_REGISTRY_HOST}/register/retriever/${publicIP}?key=${config.RETRIEVER_SECRET}`;
    console.log('registerUrl: %s', registerUrl);
    fetch(registerUrl, { method: 'POST' });
  }
}, 5000);

const server = createServer((req, res) => {
  if (!req.url) {
    return;
  }
  const url = new URL('http://localhost' + req.url);
  if (url.pathname === '/healthz') {
    res.write('ok');
    res.end();
    return;
  } else if (url.pathname === '/stats') {
    res.write(JSON.stringify(genStats()));
    res.end();
    return;
  }
  if (
    config.RETRIEVER_SECRET &&
    config.RETRIEVER_SECRET !== url.searchParams.get('key')
  ) {
    // reject request if it doesn't have key
    res.write('invalid key');
    res.statusCode = 403;
    res.end();
    return;
  }
  if (noneReady()) {
    res.write('not ready');
    res.statusCode = 500;
    res.end();
    return;
  }
  console.log(
    'numReady: %s, matches: %s/%s, profiles: %s/%s, uptime: %s, matchRequestDelay: %s',
    Object.keys(steamObj).length,
    matchSuccesses,
    matchRequests,
    profileSuccesses,
    profileRequests,
    getUptime(),
    matchRequestInterval,
  );
  if (url.pathname.startsWith('/profile')) {
    const accountId = url.pathname.split('/')[2];
    const keys = Object.keys(steamObj);
    const rKey = keys[Math.floor(Math.random() * keys.length)];
    const client = steamObj[rKey];
    profileRequests += 1;
    client.sendToGC(
      DOTA_APPID,
      EDOTAGCMsg.values.k_EMsgClientToGCGetProfileCard,
      {},
      Buffer.from(
        CMsgClientToGCGetProfileCard.encode({
          account_id: Number(accountId),
        }).finish(),
      ),
      (appid, msgType, payload) => {
        // console.log(appid, msgType, payload);
        profileSuccesses += 1;
        const profileCard = CMsgDOTAProfileCard.decode(payload);
        res.write(JSON.stringify(profileCard));
        res.end();
      },
    );
  } else if (url.pathname.startsWith('/match')) {
    // Don't allow requests coming in too fast
    const curTime = Date.now();
    if (
      lastMatchRequestTime &&
      curTime - lastMatchRequestTime < matchRequestInterval
    ) {
      res.statusCode = 429;
      res.write('too many requests');
      res.end();
      return;
    }
    lastMatchRequestTime = curTime;
    const keys = Object.keys(steamObj);
    // Round robin request to spread load evenly
    const rKey = keys[matchRequests % keys.length];
    const matchId = url.pathname.split('/')[2];
    const client = steamObj[rKey];
    matchRequests += 1;
    // If the selected client has multiple consecutive failures, skip the request
    if (matchAttempts[rKey] >= accountAttemptMax) {
      res.statusCode = 500;
      res.write('too many attempts');
      res.end();
      return;
    }
    res.setHeader('x-match-request-steamid', rKey);
    res.setHeader('x-match-request-ip', publicIP);
    matchAttempts[rKey] = (matchAttempts[rKey] ?? 0) + 1;
    console.time('match:' + matchId);
    const timeout = setTimeout(() => {
      // Respond to send back header info even if no response from GC
      // Use a 204 status code to avoid exception, we'll check the response body after and read headers
      console.timeEnd('match:' + matchId);
      res.statusCode = 204;
      res.end();
    }, 2500);
    client.sendToGC(
      DOTA_APPID,
      EDOTAGCMsg.values.k_EMsgGCMatchDetailsRequest,
      {},
      Buffer.from(
        CMsgGCMatchDetailsRequest.encode({
          match_id: Number(matchId),
        }).finish(),
      ),
      (appid, msgType, payload) => {
        clearTimeout(timeout);
        // Check if we already sent the response to avoid double-sending on slow requests
        if (!res.headersSent) {
          console.timeEnd('match:' + matchId);
          const matchData: any = CMsgGCMatchDetailsResponse.decode(payload);
          if (matchData.result === 15) {
            // Valve is blocking GC access to this match, probably a community prediction match
            // Send back 204 success with a specific header that tells us not to retry
            res.setHeader('x-match-noretry', matchData.result);
            res.statusCode = 204;
            res.end();
            return;
          }
          matchSuccesses += 1;
          // Reset on success
          delete matchAttempts[rKey];
          // Compress and send
          res.setHeader('Content-Encoding', 'gzip');
          res.write(gzipSync(JSON.stringify(matchData)));
          res.end();
          return;
        }
      },
    );
  } else if (url.pathname.startsWith('/aliases')) {
    // example: 76561198048632981
    const keys = Object.keys(steamObj);
    const rKey = keys[Math.floor(Math.random() * keys.length)];
    const client = steamObj[rKey];
    client.getAliases(
      url.pathname.split('/')[2]?.split(','),
      (err, aliases) => {
        if (err) {
          res.statusCode = 500;
          res.write(err);
          res.end();
          return;
        }
        res.write(JSON.stringify(aliases));
        res.end();
        return;
      },
    );
  } else {
    res.statusCode = 404;
    res.write('not found');
    res.end();
    return;
  }
});

async function init() {
  let logOns: { accountName: string; password: string }[] | null = null;
  if (config.SERVICE_REGISTRY_HOST) {
    // Fetch logons from remote
    while (!logOns?.length) {
      try {
        const logOnUrl =
          'https://' +
          config.SERVICE_REGISTRY_HOST +
          '/retrieverData?key=' +
          config.RETRIEVER_SECRET +
          '&count=' +
          numAccounts;
        console.log('logOnUrl: %s', logOnUrl);
        const resp = await fetch(logOnUrl);
        if (resp.ok) {
          logOns = await resp.json();
        }
      } catch (e) {
        console.error(e);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  } else {
    // Generate logons from config
    let users = config.STEAM_USER.split(',');
    let passes = config.STEAM_PASS.split(',');
    logOns = users.map((u, i) => ({
      accountName: u,
      password: passes[i],
    }));
  }
  // Some logins may fail, and sometimes the Steam CM never returns a response
  // So don't await init and we'll just make sure we have at least one working with noneReady
  await Promise.allSettled(
    logOns.map(
      (logOnDetails) =>
        new Promise<void>((resolve, reject) => {
          const client = new SteamUser();
          client.on('loggedOn', () => {
            console.log('[STEAM] Logged on %s', logOnDetails.accountName);
            // Get our public IP from Steam
            publicIP = client.publicIP;
            // Launch Dota 2
            client.gamesPlayed(DOTA_APPID);
          });
          client.on('appLaunched', (appid) => {
            client.sendToGC(
              appid,
              EGCBaseClientMsg.values.k_EMsgGCClientHello,
              {},
              Buffer.alloc(0),
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
              steamObj[logOnDetails.accountName] = client;
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
  };
  return data;
}

init();
server.listen(port, () => {
  console.log('[RETRIEVER] listening on %s', port);
});
