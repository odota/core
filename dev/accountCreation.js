const Steam = require('steam');
const SteamUser = require('steam-user');
const async = require('async');
const steam = new SteamUser();
steam.logOn();
steam.on('loggedOn', () => {
  console.error('Logged into Steam');
  const indices = [];
  for (let i = 0; i < 3000; i++)
  {
    indices.push(i);
  }
  async.eachSeries(indices, (i, cb) => {
    const name = 'series5_' + i;
    const password = (Math.random() + 1).toString(36).substring(7);
    const email = name + '@email.com';
    steam.createAccount(name, password, email, (result, steamid) => {
      console.error(name, password, steamid);
      if (Steam.EResult.DuplicateName === result)
      {
        console.error('Duplicate');
      }
      else if (Steam.EResult.IllegalPassword === result)
      {
        console.error('IllegalPassword');
      }
      else
      {
        console.log('%s\t%s', name, password);
      }
      cb();
    });
  }, (err) => {
    console.error(err);
    process.exit(Number(err));
  });
});
