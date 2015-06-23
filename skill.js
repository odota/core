var utility = require('./utility');
var async = require('async');
var result = {};
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
        //finished all three skill levels
        //start over
        scanSkill();
        //iterate through results
        //TODO check db to see if this match exists, add skill data
        //TODO optimization; don't re-check/re-insert if already processed this match id
    });
}

function getPageData(start, skill, cb) {
    console.log(Object.keys(result).length);
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