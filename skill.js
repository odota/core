var utility = require('./utility');
var async = require('async');
var db = require('./db');
var result = {};
var record = {};
var total = 0;
scanSkill();

function scanSkill() {
    //for each skill level
    var skills = [1, 2, 3];
    async.each(skills, function(skill, cb) {
        //use api_skill
        var start = null;
        getPageData(start, skill, cb);
    }, function(err) {
        if (err) {
            console.log(err);
        }
        //iterate through results
        async.each(Object.keys(result), function(match_id, cb) {
            var skill = result[match_id];
            if (!record[match_id]) {
                //TODO race condition if match sequence API is behind, since we don't add data for matches not in db
                record[match_id] = skill;
                db.matches.update({
                    match_id: Number(match_id)
                }, {
                    $set: {
                        skill: skill
                    }
                }, function(err,num) {
                    total += num;
                    cb(err);
                });
            }
            else {
                cb();
            }
        }, function(err) {
            if (err) {
                console.log(err);
            }
            console.log("matches: %s, skill_added: %s", Object.keys(record).length, total);
            //dump record once in a while to prevent memory leak
            if (Object.keys(record).length > 1000000) {
                record = {};
            }
            result = {};
            //start over
            scanSkill();
        });
    });
}

function getPageData(start, skill, cb) {
    var container = utility.generateJob("api_skill", {
        skill: skill,
        start_at_match_id: start
    });
    utility.getData(container.url, function(err, data) {
        if (err) {
            return cb(err);
        }
        //data is in data.result.matches
        var matches = data.result.matches;
        matches.forEach(function(m) {
            result[m.match_id] = skill;
        });
        start = matches[matches.length - 1].match_id - 1;
        //repeat until results_remaining===0
        if (data.result.results_remaining === 0) {
            cb();
        }
        else {
            getPageData(start, skill, cb);
        }
    });
}