var utility = require('./utility');
var getData = utility.getData;
var async = require('async');
var fs = require('fs');
var urls = {
    "items": "http://www.dota2.com/jsfeed/itemdata?l=english",
    "abilities": "http://www.dota2.com/jsfeed/abilitydata?l=english",
    /*
    "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
    "herodata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
    //these require an API key!
    "heroes": utility.generateJob("api_heroes", {
        language: "en-us"
    }).url,
    "leagues": utility.generateJob("api_leagues").url
    */
};
async.each(Object.keys(urls), function(key, cb) {
    var val = urls[key];
    //grab raw data from each url and save
    getData(val, function(err, result) {
        fs.writeFileSync('./json/' + key + ".json", JSON.stringify(result, null, 2));
        cb(err);
    });
}, function(err) {
    process.exit(Number(err));
});