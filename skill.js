var utility = require('./utility');
var async = require('async');
var db = require('./db');
var constants = require("./constants.json");
var results = {};
var added = {};
var config = require('./config.js');
var api_keys = config.STEAM_API_KEY.split(",");
var steam_hosts = config.STEAM_API_HOST.split(",");
var parallelism = Math.min(3 * steam_hosts.length, api_keys.length);
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
        if (Object.keys(results).length > 1000000) {
            //reset to prevent memory leak
            process.exit(0);
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
        if (!data || !data.result|| !data.result.matches){
            return getPageData(start, options, cb);
        }
        //data is in data.result.matches
        var matches = data.result.matches;
        async.each(matches, function(m, cb) {
            var match_id = m.match_id;
            //retry adding the skill data a set number of times
            results[match_id] = results[match_id] || 0;
            if (results[match_id] < 3 && !added[match_id]) {
                db.matches.update({
                    match_id: match_id
                }, {
                    $set: {
                        skill: options.skill
                    }
                }, function(err, num) {
                    //if num, we modified a match in db
                    if (num) {
                        //add to set of matches for which we were able to add skill data
                        added[match_id] = 1;
                    }
                    else {
                        //add to retry count
                        results[match_id] += 1;
                    }
                    cb(err);
                });
            }
            else {
                //already got skill for this match
                cb();
            }
        }, function(err) {
            console.log("matches: %s, skill_added: %s", Object.keys(results).length, Object.keys(added).length);
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