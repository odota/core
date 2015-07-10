var utility = require('./utility');
var async = require('async');
var db = require('./db');
var result = {};
var tries = {};
var added = {};
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
        for (var match_id in result) {
            tries[match_id] = tries[match_id] || {
                skill: result[match_id],
                tries: 0
            };
        }
        async.each(Object.keys(tries), function(match_id, cb) {
            var skill = tries[match_id].skill;
            tries[match_id].tries += 1;
            if (tries[match_id].tries <= 10) {
                db.matches.update({
                    match_id: Number(match_id)
                }, {
                    $set: {
                        skill: skill
                    }
                }, function(err, num) {
                    if (num) {
                        added[match_id] = 1;
                    }
                    cb(err);
                });
            }
            else {
                delete tries["match_id"];
                cb();
            }
        }, function(err) {
            if (err) {
                console.log(err);
            }
            console.log("matches to try: %s, skill_added: %s", Object.keys(tries).length, Object.keys(added).length);
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