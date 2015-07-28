var utility = require('./utility');
var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var constants = require("./constants.json");
var updatePlayerCaches = require('./updatePlayerCaches');
var results = {};
var config = require('./config.js');
var api_keys = config.STEAM_API_KEY.split(",");
var steam_hosts = config.STEAM_API_HOST.split(",");
var parallelism = Math.min(4 * steam_hosts.length, api_keys.length);
var skills = [1, 2, 3];
var heroes = Object.keys(constants.heroes);
var permute = [];
for (var i = 0; i < heroes.length; i++) {
    for (var j = 0; j < skills.length; j++) {
        permute.push({
            skill: skills[j],
            hero_id: heroes[i]
        });
    }
}
//permute = [{skill:1,hero_id:1}];
scanSkill();

function scanSkill() {
    async.eachLimit(permute, parallelism, function(object, cb) {
        //use api_skill
        var start = null;
        getPageData(start, object, cb);
    }, function(err) {
        if (err) {
            console.log(err);
        }
        //go through results and update db/caches
        //set limit to prevent running out of memory due to too many dbops
        async.eachLimit(Object.keys(results), 5000, function(match_id, cb) {
            var data = results[match_id];
            updatePlayerCaches({
                match_id: data.match_id,
                skill: data.skill
            }, {
                type: "skill",
                //pass players in options since we don't want to insert skill players (overwrites details)
                players: data.players
            }, function(err) {
                return cb(err);
            });
        }, function(err) {
            if (err) {
                console.error(err);
            }
            //start over
            results = {};
            scanSkill();
        });
    });
}

function getPageData(start, options, cb) {
    var container = utility.generateJob("api_skill", {
        skill: options.skill,
        hero_id: options.hero_id,
        start_at_match_id: start
    });
    utility.getData(container.url, function(err, data) {
        if (err) {
            return cb(err);
        }
        if (!data || !data.result || !data.result.matches) {
            return getPageData(start, options, cb);
        }
        //data is in data.result.matches
        var matches = data.result.matches;
        async.each(matches, function(m, cb) {
            var match_id = m.match_id;
            results[match_id] = {
                match_id: match_id,
                players: m.players,
                skill: options.skill
            };
            cb();
        }, function(err) {
            console.log("matches found in pass: %s", Object.keys(results).length);
            //repeat until results_remaining===0
            if (data.result.results_remaining === 0) {
                cb(err);
            }
            else {
                start = matches[matches.length - 1].match_id - 1;
                getPageData(start, options, cb);
            }
        });
    });
}