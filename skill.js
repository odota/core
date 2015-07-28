var utility = require('./utility');
var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var constants = require("./constants.json");
var updatePlayerCaches = require('./updatePlayerCaches');
var results = {};
var added = {};
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
        //start over
        scanSkill();
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
            if (!results[match_id]) {
                tryInsertSkill({
                    match_id: match_id,
                    //don't set as players to avoid overwriting match details
                    player_ids: m.players,
                    skill: options.skill
                }, 0);
                //don't wait for callback, since it may need to be retried
            }
            cb();
        }, function(err) {
            console.log("matches to retry: %s, skill_added: %s", Object.keys(results).length, Object.keys(added).length);
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

function tryInsertSkill(data, retries) {
    var match_id = data.match_id;
    if (retries > 3) {
        delete results[match_id];
        return;
    }
    results[match_id] = 1;
    updatePlayerCaches(data, {
        type: "skill"
    }, function(err) {
        //TODO pass back something to indicate that db was updated (nModified), so we can decide whether or not to retry, currently we only try once
        if (!err) {
            added[match_id] = 1;
            delete results[match_id];
            return;
        }
        else {
            return setTimeout(function() {
                return tryInsertSkill(data, retries + 1);
            }, 60 * 1000);
        }
    });
}