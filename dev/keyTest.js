const request = require('request');
const async = require('async');
const config = require('../config');

async.eachSeries(config.STEAM_API_KEY.split(','), (key, cb) => {
  setTimeout(() => {
    request(`http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=${key}`, (err, resp, body) => {
      console.log(key, resp.statusCode);
      if (resp.statusCode !== 200) {
        console.log(body);
      }
      cb();
    });
  }, 1000);
});
