import fs from "node:fs";
import SteamUser from "steam-user-odota";
const accountData = fs.readFileSync("./STEAM_ACCOUNT_DATA.txt", "utf8");
const accountArray = accountData.split(/\r\n|\r|\n/g);

for (let i = Number(process.argv[2]) || 0; i < accountArray.length; i++) {
  const user = accountArray[i].split(":")[0];
  const pass = accountArray[i].split(":")[1];
  const logOnDetails = {
    accountName: user,
    password: pass,
  };
  console.log(logOnDetails);
  await new Promise((resolve, reject) => {
    const client = new SteamUser();
    client.logOn(logOnDetails);
    client.on("loggedOn", (logOnResp: any) => {
      if (logOnResp.eresult === SteamUser.EResult.OK) {
        console.log(i, user, pass, "passed", logOnResp.eresult);
        client.logOff();
        resolve(null);
      } else {
        console.log(i, user, pass, "failed", logOnResp.eresult);
        fs.appendFileSync('./FAILED.txt', user + '\n');
        reject(logOnResp.eresult);
      }
    });
    client.on("steamGuard", () => {
      console.log(i, user, pass, "failed", "steamguard");
      fs.appendFileSync('./STEAM_GUARD.txt', user + '\n');
      resolve(null);
    });
    client.on("error", (err: any) => {
      console.log(err);
      if (err.eresult === SteamUser.EResult.AccountDisabled) {
        console.log(i, user, pass, "failed", err.eresult);
        fs.appendFileSync('./FAILED.txt', user + '\n');
      } else if (err.eresult === SteamUser.EResult.InvalidPassword) {
        console.log(i, user, pass, "failed", err.eresult);
        fs.appendFileSync('./FAILED.txt', user + '\n');
      }
      reject(err);
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 120000));
}
