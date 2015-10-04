var utility = require('../utility');
var generateJob = utility.generateJob;
var async = require('async');
var getData = utility.getData;
var league_url = generateJob("api_leagues", {}).url;
var total = 0;
getData(league_url, function(err, data) {
    //console.log(data);
    var league_ids = data.result.leagues.map(function(l) {
        return l.leagueid;
    });
    //iterate through leagueids and use getmatchhistory to retrieve matches for each
    async.eachSeries(league_ids, function(id, cb) {
        var url = generateJob("api_history", {
            leagueid: id
        }).url;
        getData(url, function(err, data) {
            //TODO paginate through results
            //TODO getmatchdetails for each match_id
            console.log(id, data.result.total_results);
            total += data.result.total_results;
            cb(err);
        });
    }, function(err) {
        console.log("total matches: %s", total);
    });
});