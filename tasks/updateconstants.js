var utility = require('../util/utility');
var getData = utility.getData;
var async = require('async');
var fs = require('fs');
var urls = {
    "items": "http://www.dota2.com/jsfeed/itemdata?l=english",
    "abilities": "http://www.dota2.com/jsfeed/abilitydata?l=english",
    "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
    "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
    "heroes": utility.generateJob("api_heroes",
    {
        language: "en-us"
    }).url,
    //"leagues": utility.generateJob("api_leagues").url,
    "regions": "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/regions.json",
    "npc_abilities": "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json"
};
async.each(Object.keys(urls), function(key, cb)
{
    var val = urls[key];
    //grab raw data from each url and save
    getData(val, function(err, result)
    {
        fs.writeFileSync('./json/' + key + ".json", JSON.stringify(result, null, 2));
        cb(err);
    });
}, function(err)
{
    if (err)
    {
        console.error(err);
    }
    process.exit(Number(err));
});