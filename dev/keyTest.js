const request = require('request');
const config = require('../config');
const async = require('async');
async.eachSeries(config.STEAM_API_KEY.split(','), (key, cb) => {
  setTimeout(() => {
    request('http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=' + key, (err, resp, body) => {
      console.log(key, resp.statusCode);
      if (resp.statusCode !== 200)
            {
        console.log(body);
      }
      cb();
    });
  }, 1000);
});
