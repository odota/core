/* eslint-disable */
const Steam = require('steam');
const SteamUser = require('steam-user');
const async = require('async');

const steam = new SteamUser();
const time = Math.floor(new Date() / 1000);
async.eachSeries(Array.from(new Array(1000), (v, i) => i), (i, cb) => {
  steam.logOn(() => {});
  steam.once('loggedOn', () => {
    const name = `${time}_${i}`;
    const password = (Math.random() + 1).toString(36).substring(7);
    const email = `${name}@email.com`;
    steam.createAccount(name, password, email, (result, steamid) => {
      console.error(name, password, result, steamid);
      if (result === Steam.EResult.OK) {
        console.log('%s\t%s', name, password);
      }
      steam.logOff(() => {});
      setTimeout(cb, 61000);
    });
  });
}, (err) => {
  console.error(err);
  process.exit(Number(err));
});
