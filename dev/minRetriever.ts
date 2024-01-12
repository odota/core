import SteamUser from 'steam-user';
import express from 'express';
import compression from 'compression';
import config from '../config';
import ProtoBuf from 'protobufjs';

const app = express();
let users = config.STEAM_USER;
let passes = config.STEAM_PASS;
const port = config.PORT || config.RETRIEVER_PORT;
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

app.use(compression());
app.get('/healthz', (req, res, cb) => {
  return res.end('ok');
});
app.get('/profile/:account_id', async (req, res, cb) => {
  const accountId = req.params.account_id;
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
      const profileCard = CMsgDOTAProfileCard.decode(payload);
      return res.json(profileCard);
    },
  );
});
app.get('/match/:match_id', async (req, res, cb) => {
  const matchId = req.params.match_id;
  client.sendToGC(
    DOTA_APPID,
    EDOTAGCMsg.values.k_EMsgGCMatchDetailsRequest,
    {},
    Buffer.from(
      CMsgGCMatchDetailsRequest.encode({ match_id: Number(matchId) }).finish(),
    ),
    (appid, msgType, payload) => {
      const matchData: any = CMsgGCMatchDetailsResponse.decode(payload);
      return res.json(matchData);
    },
  );
});
app.get('/aliases/:steam_ids', async (req, res, cb) => {
  client.getAliases(
    req.params.steam_ids?.split(','),
    (err, aliases) => {
      if (err) {
        return cb(err);
      }
      return res.json(aliases);
    });
});

const logOnDetails = { accountName: users, password: passes };
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
    Buffer.alloc(0),
  );
});
client.on('receivedFromGC', (appid, msgType, payload) => {
  if (msgType === EGCBaseClientMsg.values.k_EMsgGCClientWelcome) {
    app.listen(port, () => {
      console.log('[RETRIEVER] listening on %s', port);
    });
  }
});
client.on('error', (err: any) => {
  console.error(err);
});
client.logOn(logOnDetails);
