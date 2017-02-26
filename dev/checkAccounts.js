/* eslint-disable */
const fs = require('fs');
const Steam = require('steam');
const async = require('async');

const accountData = fs.readFileSync('../STEAM_ACCOUNT_DATA.txt', 'utf8');
const accountArray = accountData.split('\n');

let index = -1;
async.whilst(() => true, (cb) => {
  index += 1;
  //const random = index;
  const random = Math.floor(Math.random() * accountArray.length);
  const user = accountArray[random].split('\t')[0];
  const pass = accountArray[random].split('\t')[1];
  const logOnDetails = {
    account_name: user,
    password: pass
  };
  const client = new Steam.SteamClient();
  client.steamUser = new Steam.SteamUser(client);
  client.connect();
  client.on('connected', () => {
    console.error('[STEAM] Trying to log on with %s,%s: %s', user, pass, index);
    client.steamUser.logOn(logOnDetails);
  });
  client.on('logOnResponse', (logOnResp) => {
    if (logOnResp.eresult !== Steam.EResult.OK) {
      console.error(logOnResp);
      console.error('failed');
      throw new Error('failed');
    }
    else {
      console.error('passed');
      setTimeout(cb, 1000);
    }
  });
}, () => {});
