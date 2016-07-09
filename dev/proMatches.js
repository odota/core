var utility = require('../util/utility');
var generateJob = utility.generateJob;
var async = require('async');
var getData = utility.getData;
var league_url = generateJob("api_leagues",
{}).url;
var total = 0;
getData(league_url, function(err, data)
{
    if (err)
    {
        process.exit(1);
    }
    //console.log(data);
    var league_ids = data.result.leagues.map(function(l)
    {
        return l.leagueid;
    });
    //iterate through leagueids and use getmatchhistory to retrieve matches for each
    async.eachSeries(league_ids, function(leagueid, cb)
    {
        if (leagueid < 3500)
        {
            return cb();
        }
        var url = generateJob("api_history",
        {
            leagueid: leagueid
        }).url;
        getPage(url, leagueid, cb);
    }, function(err)
    {
        process.exit(Number(err));
    });
});

function getPage(url, leagueid, cb)
{
    getData(url, function(err, data)
    {
        console.error(leagueid, data.result.total_results, data.result.results_remaining);
        data.result.matches.forEach(function(match)
        {
            if (match.match_id > 2330655963)
            {
                console.log(match.match_id);
            }
        });
        if (data.result.results_remaining)
        {
            var url2 = generateJob("api_history",
            {
                leagueid: leagueid,
                start_at_match_id: data.result.matches[data.result.matches.length - 1].match_id - 1,
            }).url;
            getPage(url2, leagueid, cb);
        }
        else
        {
            cb(err);
        }
    });
}