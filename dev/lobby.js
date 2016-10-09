const config = require('./config');
const Steam = require('steam');
const Dota2 = require('dota2');
const utility = require('./utility');
const async = require('async');
const convert64To32 = utility.convert64to32;
const express = require('express');
const app = express();
const users = config.STEAM_USER.split(',');
const passes = config.STEAM_PASS.split(',');
const steamObj = {};
const accountToIdx = {};
const replayRequests = 0;
const launch = new Date();
let launched = false;
const a = [];
const port = config.PORT || config.RETRIEVER_PORT;
// create array of numbers from 0 to n
const count = 0;
while (a.length < users.length) a.push(a.length + 0);
async.each(a, (i, cb) => {
  let dotaReady = false;
  const relationshipReady = false;
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
            // reset
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
    client.steamFriends.setPersonaName(client.steamID);
    steamObj[client.steamID] = client;
    client.Dota2.launch();
    client.Dota2.once('ready', () => {
            // console.log("Dota 2 ready");
      dotaReady = true;
      const dota = client.Dota2;
      dota.inviteToParty(utility.convert32to64(88367253).toString());
      setTimeout(() => {
        console.log('lobby');
        dota.leavePracticeLobby();
        dota.on('practiceLobbyUpdate', (msg) => {
          console.log(msg);
        });
        dota.createPracticeLobby();
      }, 10000);
      cb();
    });
    client.once('loggedOff', () => {
      console.log('relogging');
      client.steamUser.logOn(logOnDetails);
    });
  });
}, () => {
    // start listening
  launched = true;
  const server = app.listen(port, () => {
    const host = server.address().address;
    console.log('[RETRIEVER] listening at http://%s:%s', host, port);
  });
  app.get('/', (req, res, next) => {});
});
