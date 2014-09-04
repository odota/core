var $ = require('cheerio')
var request = require('request')
var db = require('monk')('localhost/dota');
var matchPlayers = db.get('matchPlayers');
var host = "http://www.dotabuff.com";
var player_id;
var callCount = 0;

var express = require('express'),
    app = express();

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.route('/players/:player_id').get(function(request, response) { 
    player_id = request.params.player_id;
    getCounts(request.query.update, function(result){        
        response.send(result);
    });
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})

function getCounts (fullUpdate, callback) {
    getMatches(host+"/players/"+player_id+"/matches", fullUpdate, function(){
        matchPlayers.find({players: { $elemMatch: { id: player_id }}}, function(err, data){
            console.log(data.length);
            var counts = {};
            for (i=0;i<data.length;i++){
                for (j=0;j<data[i].players.length; j++){
                    var player = data[i].players[j]
                    if (player.id==player_id){
                        var playerResult = player.winner;
                    }
                }
                for (j=0;j<data[i].players.length; j++){
                    var player = data[i].players[j]
                    if (player.winner == playerResult){
                        if (!counts[player.id]){
                            counts[player.id]={};
                            counts[player.id]["win"]=0;
                            counts[player.id]["lose"]=0;
                        }
                        if (player.winner){
                            counts[player.id]["win"]+=1;
                        }
                        else{
                            counts[player.id]["lose"]+=1;
                        }
                    }
                }
            }
            callback(counts);
        });
    });
}

function getMatches(player_url, paginate, callback){
    callCount++;
    request(player_url, function processMatches (err, resp, html) {
        if (err) return console.error(err)
        var parsedHTML = $.load(html);
        if (paginate){
            var nextPath = parsedHTML('a[rel=next]').first().attr('href');
        }
        parsedHTML('td[class=cell-xlarge]').map(function(i, matchCell) {
            var match_url = host+$(matchCell).children().first().attr('href');  
            matchPlayers.findOne({match_id: getIdFromPath(match_url)}, function(err, data) {
                if (err) throw err
                if (!data) {
                    request(match_url, function (err, resp, html) {
                        if (err) return console.error(err)
                        var matchHTML = $.load(html)
                        var radiant_win=matchHTML('.match-result').hasClass('radiant');
                        var match_object = {};
                        match_object.match_id = getIdFromPath(match_url);
                        match_object.players=[];
                        matchHTML('a[class=player-radiant]').map(function(i, link) {
                            player_object={};
                            player_object.id=getIdFromPath($(link).attr('href'));
                            player_object.winner=radiant_win;
                            match_object.players.push(player_object);
                        })
                        matchHTML('a[class=player-dire]').map(function(i, link) {
                            player_object={};
                            player_object.id=getIdFromPath($(link).attr('href'));
                            player_object.winner=!radiant_win;
                            match_object.players.push(player_object);                        
                        })
                        console.log("adding match %s", match_object.match_id);
                        matchPlayers.insert(match_object);
                    });
                }
                else{
                    console.log("found match %s", getIdFromPath(match_url));
                }
            });      
        });
        if (nextPath){
            getMatches(host+nextPath, true, callback);
        }
        callCount--;
        if (callCount == 0 && callback){
            callback();
        }
    });
}


function getIdFromPath(input){
    return input.split(/[/]+/).pop();
}

function isEmpty(obj) {
    for(var prop in obj) {
        if(obj.hasOwnProperty(prop))
            return false;
    }

    return true;
}