/**
 * Worker checking the GetMatchHistory endpoint to get skill data for matches
 **/
var constants = require('dotaconstants');
var config = require('../config.js');
var utility = require('../util/utility');
var db = require('../store/db');
var queries = require('../store/queries');
var async = require('async');
//var insertMatch = queries.insertMatch;
var insertMatchSkill = queries.insertMatchSkill;
var results = {};
var added = {};
var api_keys = config.STEAM_API_KEY.split(",");
var parallelism = Math.min(3, api_keys.length);
//TODO use cluster to spawn a separate worker for each skill level for greater throughput?
var skills = [1, 2, 3];
var heroes = Object.keys(constants.heroes);
var permute = [];
for (var i = 0; i < heroes.length; i++)
{
    for (var j = 0; j < skills.length; j++)
    {
        permute.push(
        {
            skill: skills[j],
            hero_id: heroes[i]
        });
    }
}
//permute = [{skill:1,hero_id:1}];
console.log(permute.length);
scanSkill();

function scanSkill()
{
    async.eachLimit(permute, parallelism, function(object, cb)
    {
        //use api_skill
        var start = null;
        getPageData(start, object, cb);
    }, function(err)
    {
        if (err)
        {
            throw err;
        }
        return scanSkill();
    });
}

function getPageData(start, options, cb)
{
    var container = utility.generateJob("api_skill",
    {
        skill: options.skill,
        hero_id: options.hero_id,
        start_at_match_id: start
    });
    utility.getData(
    {
        url: container.url,
    }, function(err, data)
    {
        if (err)
        {
            return cb(err);
        }
        if (!data || !data.result || !data.result.matches)
        {
            return getPageData(start, options, cb);
        }
        //data is in data.result.matches
        var matches = data.result.matches;
        async.eachSeries(matches, function(m, cb)
        {
            insertMatchSkill(db,
            {
                match_id: m.match_id,
                skill: options.skill
            }, cb);
        }, function(err)
        {
            if (err)
            {
                return cb(err);
            }
            console.log("total results: %s, added: %s", Object.keys(results).length, Object.keys(added).length);
            //repeat until results_remaining===0
            if (data.result.results_remaining === 0)
            {
                cb(err);
            }
            else
            {
                start = matches[matches.length - 1].match_id - 1;
                return getPageData(start, options, cb);
            }
        });
    });
}
