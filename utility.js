var utility = exports,
    fs = require('fs'),
    async = require('async'),
    BigNumber = require('big-number').n;
utility.redis = require('redis').createClient(process.env.REDIS_PORT || 6379, process.env.REDIS_HOST || '127.0.0.1', {});
utility.kue = require('kue');
utility.jobs = utility.kue.createQueue({
    redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || '127.0.0.1'
    }
})
utility.jobs.promote();
utility.db = require('monk')(process.env.MONGOHQ_URL || "mongodb://localhost/dota");
utility.matches = utility.db.get('matches');
utility.matches.index('match_id', {
    unique: true
});
utility.players = utility.db.get('players');
utility.players.index('account_id', {
    unique: true
})
utility.constants = utility.db.get('constants');
//given an array of player ids, join with data from players collection
utility.fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        utility.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if(dbPlayer) {
                for(var prop in dbPlayer) {
                    player[prop] = dbPlayer[prop]
                }
            }
            cb(null)
        })
    }, function(err) {
        cb(err)
    })
}
utility.getMatches = function(account_id, cb) {
    var search = {
        duration: {
            $exists: true
        }
    }
    if(account_id) {
        search.players = {
            $elemMatch: {
                account_id: account_id
            }
        }
    }
    utility.matches.find(search, {
        sort: {
            match_id: -1
        }
    }, function(err, docs) {
        cb(err, docs)
    })
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
utility.convert64to32 = function(id) {
    return BigNumber(id).minus('76561197960265728')
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
utility.convert32to64 = function(id) {
    return BigNumber('76561197960265728').plus(id)
}
utility.isRadiant = function(player) {
    return player.player_slot < 64
}