import fs from 'fs';
import SteamUser from 'steam-user';
import { EOL } from 'os';
const accountData = fs.readFileSync('./STEAM_ACCOUNT_DATA_BAD.txt', 'utf8');
const accountArray = accountData.split(EOL);

let index = Number(process.argv[2]) || -1;
index += 1;
const random = index;
// const random = Math.floor(Math.random() * accountArray.length);
const user = accountArray[random].split('\t')[0];
const pass = accountArray[random].split('\t')[1];
const logOnDetails = {
  account_name: user,
  password: pass,
};
const client = new SteamUser;
client.logOn();
client.on('loggedOn', (logOnResp: any) => {
  console.error(index, user, 'passed', logOnResp.eresult);
});
client.on('error', (err: any) => {
  console.error(err);
  if (err.eresult === SteamUser.EResult.AccountDisabled) {
    console.error(index, user, 'failed', err.eresult);
  } else if (err.eresult === SteamUser.EResult.InvalidPassword) {
    console.error(index, user, 'failed', err.eresult);
  } 
});
