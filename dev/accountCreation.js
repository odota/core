var Steam = require('steam');
var SteamUser = require('steam-user');
var async = require('async');
var steam = new SteamUser();
steam.logOn();
steam.on('loggedOn', function ()
{
  console.error("Logged into Steam");
  var indices = [];
  for (var i = 0; i < 10000; i++)
  {
    indices.push(i);
  }
  async.eachSeries(indices, function (i, cb)
  {
    var name = 'series3_' + i;
    var password = (Math.random() + 1).toString(36).substring(7);
    var email = name + '@email.com';
    steam.createAccount(name, password, email, function (result, steamid)
    {
      console.error(name, password, steamid);
      if (Steam.EResult.DuplicateName === result)
      {
        console.error("Duplicate");
      }
      else if (Steam.EResult.IllegalPassword === result)
      {
        console.error("IllegalPassword");
      }
      else
      {
        console.log('%s,%s', name, password);
      }
      cb();
    });
  }, function (err)
  {
    console.error(err);
    process.exit(Number(err));
  });
});