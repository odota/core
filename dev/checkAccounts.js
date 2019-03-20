/* eslint-disable */
const fs = require('fs');
const Steam = require('steam');
const async = require('async');

const accountData = fs.readFileSync('./STEAM_ACCOUNT_DATA_BAD.txt', 'utf8');
const accountArray = accountData.split(require('os').EOL);

let index = Number(process.argv[2]) || -1;
async.whilst(() => true, (cb) => {
  index += 1;
  const random = index;
  // const random = Math.floor(Math.random() * accountArray.length);
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
    client.steamUser.logOn(logOnDetails);
  });
  client.on('logOnResponse', (logOnResp) => {
    if (logOnResp.eresult === Steam.EResult.AccountDisabled) {
      console.error(index, user, 'failed', logOnResp.eresult);
    }
    else if (logOnResp.eresult === Steam.EResult.InvalidPassword) {
      console.error(index, user, 'failed', logOnResp.eresult);
    }
    else {
      console.error(index, user, 'passed', logOnResp.eresult);
    }
    client.disconnect();
    setTimeout(cb, 500);
  });
}, () => {});
