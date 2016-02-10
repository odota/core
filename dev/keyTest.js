var request = require('request');
var config = require('../config');
var async = require('async');
async.eachSeries(config.STEAM_API_KEY.split(','), function(key, cb)
{
    setTimeout(function()
    {
        request('http://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?key=' + key, function(err, resp, body)
        {
            console.log(key, resp.statusCode);
            if (resp.statusCode !== 200)
            {
                console.log(body);
            }
            cb();
        });
    }, 1000);
});
