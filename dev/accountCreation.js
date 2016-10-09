const Steam = require('steam');
const SteamUser = require('steam-user');
const async = require('async');
const steam = new SteamUser();
steam.logOn();
steam.on('loggedOn', () => {
  console.error('Logged into Steam');
  async.eachSeries(Array.from(new Array(1000), (v, i) => i), (i, cb) => {
    const name = `series8_${i}`;
    const password = (Math.random() + 1).toString(36).substring(7);
    const email = `${name}@email.com`;
    steam.createAccount(name, password, email, (result, steamid) => {
      console.error(name, password, steamid);
      if (Steam.EResult.DuplicateName === result) {
        console.error('Duplicate');
      } else if (Steam.EResult.IllegalPassword === result) {
        console.error('IllegalPassword');
      } else {
        console.log('%s\t%s', name, password);
      }
      cb();
    });
  }, (err) => {
    console.error(err);
    process.exit(Number(err));
  });
});
