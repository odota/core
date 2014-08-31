var $ = require('cheerio')
var request = require('request')
var db = require('monk')('localhost/dota');
var matchPlayers = db.get('matchPlayers');
var host = "http://www.dotabuff.com";
var express = require('express'),
    app = express();

getMatches(host+"/players/102344608/matches?page=74");

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.route('/players/:player_id').get(function(request, response) {
    getMatches(host+"/players/"+request.params.player_id+"/matches?page=74");
})

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})

function getMatches(player_url){
    request(player_url, function (err, resp, html) {
        if (err) return console.error(err)
        var parsedHTML = $.load(html)
        parsedHTML('td[class=cell-xlarge]').map(function(i, cell) {
            var match_url = host+$(cell).children().first().attr('href')
            var match_object = {};
            match_object.match_id=getIdFromPath(match_url);
            request(match_url, function (err, resp, html) {
                if (err) return console.error(err)
                var parsedHTML = $.load(html)
                parsedHTML('.match-result').hasClass("");
                radiant=[];
                parsedHTML('a[class=player-radiant]').map(function(i, link) {
                    radiant.push(getIdFromPath($(link).attr('href')));
                })
                dire=[];
                parsedHTML('a[class=player-dire]').map(function(i, link) {
                    dire.push(getIdFromPath($(link).attr('href')));
                })
                match_object.radiant=radiant;
                match_object.dire=dire;
                console.log(match_object);
            });
        })
        var nextPath = parsedHTML('a[rel=next]').first().attr('href');
        if (nextPath){
            getMatches(host+nextPath);
        }
    });
}

function getIdFromPath(input){
    return input.split(/[/]+/).pop();
}