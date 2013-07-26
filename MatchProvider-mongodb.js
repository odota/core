var Db = require('mongodb').Db,
    Server = require('mongodb').Server;

MatchProvider = function(host, port) {
    this.db= new Db('matchurls', new Server(host, port, {auto_reconnect: true}), {w: 0});
    this.db.open(function(){});
};


MatchProvider.prototype.getCollection = function(callback) {
    this.db.collection('matches', function(error, matchCollection) {
        if( error ) callback(error);
        else callback(null, matchCollection);
    });
};

MatchProvider.prototype.findAll = function(callback) {
    this.getCollection(function(error, matchCollection) {
        if( error ) callback(error);
        else {
            matchCollection.find().toArray(function(error, results) {
                if( error ) callback(error);
                else callback(null, results);
            });
        }
    });
};


MatchProvider.prototype.findByMatchId = function(matchId, callback) {
    this.getCollection(function(error, matchCollection) {
        if( error ) callback(error);
        else {
            matchCollection.findOne({id: matchId}, function(error, result) {
                if( error ) callback(error);
                else callback(null, result);
            });
        }
    });
};

MatchProvider.prototype.save = function(matches, callback) {
    this.getCollection(function(error, matchCollection) {
        if( error ) callback(error);
        else {
            if( typeof(matches.length)=="undefined")
                matches = [matches];

            matchCollection.insert(matches, function() {
                callback(null, matches);
            });
        }
    });
};

exports.MatchProvider = MatchProvider;