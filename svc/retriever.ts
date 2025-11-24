/**
 * Gets data from the Steam GC.
 * Provides HTTP endpoints for other workers.
 * Approx limits: 100 per account per day, 500 per IP per day
 * */
import SteamUser from 'steam-user-odota';
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
const failedLogin: Record<string, string> = {};
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
  if (url.pathname === '/') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const data = {
      matchRequests,
      matchSuccesses,
      // profileRequests,
      // profileSuccesses,
      uptime: getUptime(),
      osUptime: getOSUptime(),
      hostname: os.hostname(),
      numReadyAccounts: Object.keys(steamObj).length,
      failedLogin,
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return;
  } else if (url.pathname === '/healthz') {
    res.end('ok');
    return;
  }
  if (
    config.RETRIEVER_SECRET &&
    config.RETRIEVER_SECRET !== url.searchParams.get('key')
  ) {
    // reject request if it doesn't have key
    res.statusCode = 403;
    res.end('invalid key');
    return;
  }
  if (noneReady()) {
    res.statusCode = 500;
    res.end('not ready');
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
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(profileCard));
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
      res.end('too many requests');
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
      res.end('too many attempts');
      return;
    }
    res.setHeader('x-match-request-steamid', rKey);
    res.setHeader('x-match-request-ip', publicIP);
    matchAttempts[rKey] = (matchAttempts[rKey] ?? 0) + 1;
    const start = Date.now();
    const timeout = setTimeout(() => {
      // Respond to send back header info even if no response from GC
      // Use a 204 status code to avoid exception, we'll check the response body after and read headers
      res.statusCode = 204;
      res.end();
    }, 3000);
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
          const end = Date.now();
          console.log('match %s: %dms', matchId, end - start);
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
          res.end(gzipSync(JSON.stringify(matchData)));
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
          res.end(err.message || err);
          return;
        }
        res.end(JSON.stringify(aliases));
        return;
      },
    );
  } else {
    res.statusCode = 404;
    res.end('not found');
    return;
  }
});
server.listen(port, () => {
  console.log('[RETRIEVER] listening on %s', port);
});

let logOns: { accountName: string; password: string }[] | null = null;
if (config.SERVICE_REGISTRY_HOST) {
  // Fetch logons from remote
  while (!logOns?.length) {
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
    } else {
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
// So don't block on successful login and we'll just make sure we have at least one working with noneReady
logOns.forEach((logOnDetails) => {
  const client = new SteamUser();
  let relogTimeout: NodeJS.Timeout | undefined;
  client.on('loggedOn', () => {
    console.log('%s: loggedOn', logOnDetails.accountName);
    // Get our public IP from Steam
    publicIP = client.publicIP;
    // Launch Dota 2
    client.gamesPlayed(DOTA_APPID, true);
    relogTimeout = setTimeout(() => {
      // Relog if we don't successfully finish connecting
      console.log('%s: relogging', logOnDetails.accountName);
      client.relog();
    }, 5000);
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
      `${logOnDetails.accountName}: Received message ${msgType} from GC ${appid} with ${payload.length} bytes`,
    );
    if (msgType === EGCBaseClientMsg.values.k_EMsgGCClientWelcome) {
      if (!client.steamID) {
        console.log('%s: client not connected', logOnDetails.accountName);
        return;
      }
      clearTimeout(relogTimeout);
      console.log(
        '%s: ready',
        logOnDetails.accountName,
        // client.steamID.toString(),
      );
      steamObj[logOnDetails.accountName] = client;
    }
    // We can also handle other GC responses here if not using callbacks
  });
  client.on('steamGuard', (domain, callback) => {
    console.log('Steam Guard code needed from email ending in ' + domain);
    failedLogin[logOnDetails.accountName] = 'steamGuard';
    // callback(code);
  });
  client.on('error', (err: any) => {
    console.error(err);
    failedLogin[logOnDetails.accountName] = SteamUser.EResult[err.eresult];
  });
  client.logOn(logOnDetails);
});

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
