import fs from 'fs';
import SteamUser from 'steam-user';
const accountData = fs.readFileSync('./STEAM_ACCOUNT_DATA.txt', 'utf8');
const accountArray = accountData.split(/\r\n|\r|\n/g);

for (let i = Number(process.argv[2]) || 0; i < accountArray.length; i++) {
  const user = accountArray[i].split('\t')[0];
  const pass = accountArray[i].split('\t')[1];
  const logOnDetails = {
    accountName: user,
    password: pass,
  };
  console.log(logOnDetails);
  await new Promise((resolve) => {
    const client = new SteamUser();
    client.logOn(logOnDetails);
    client.on('loggedOn', (logOnResp: any) => {
      if (logOnResp.eresult === SteamUser.EResult.OK) {
        console.error(i, user, pass, 'passed', logOnResp.eresult);
        client.logOff();
        resolve(null);
      } else {
        console.error(i, user, pass, 'failed', logOnResp.eresult);
        process.exit(1);
      }
    });
    client.on('steamGuard', () => {
      console.error(i, user, pass, 'failed', 'steamguard');
      process.exit(1);
    });
    client.on('error', (err: any) => {
      console.error(err);
      if (err.eresult === SteamUser.EResult.AccountDisabled) {
        console.error(i, user, pass, 'failed', err.eresult);
      } else if (err.eresult === SteamUser.EResult.InvalidPassword) {
        console.error(i, user, pass, 'failed', err.eresult);
      }
      process.exit(1);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
