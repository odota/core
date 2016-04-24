var JSONStream = require('JSONStream');
var db = require('../db');
var cassandra = require('../cassandra');
var utility = require('../utility');
var async = require('async');
var playerCache = require('../playerCache');
var constants = require('../constants');
var updateCache = playerCache.updateCache;
var serialize = utility.serialize;
var args = process.argv.slice(2);
var start_id = Number(args[0]) || 0;
var stream = db.select().from('matches').where('match_id', '>=', start_id).orderBy("match_id", "asc").stream();
stream.on('end', exit);
stream.pipe(JSONStream.parse());
stream.on('data', function(match)
{
    stream.pause();
    insertMatch(match, function(err)
    {
        if (err)
        {
            return exit(err);
        }
        db.select(['player_matches.match_id', 'player_matches.account_id', 'player_slot', 'hero_id', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'kills', 'deaths', 'assists', 'leaver_status', 'gold', 'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_spent', 'hero_damage', 'tower_damage', 'hero_healing', 'level', 'additional_units', 'stuns', 'max_hero_hit', 'times', 'gold_t', 'lh_t', 'xp_t', 'obs_log', 'sen_log', 'purchase_log', 'kills_log', 'buyback_log', 'lane_pos', 'obs', 'sen', 'actions', 'pings', 'purchase', 'gold_reasons', 'xp_reasons', 'killed', 'item_uses', 'ability_uses', 'hero_hits', 'damage', 'damage_taken', 'damage_inflictor', 'runes', 'killed_by', 'kill_streaks', 'multi_kills', 'life_state', 'radiant_win', 'start_time', 'duration', 'cluster', 'lobby_type', 'game_mode', 'parse_status']).from('player_matches').join('matches', 'player_matches.match_id', 'matches.match_id').where('matches.match_id', '=', match.match_id).asCallback(function(err, pms)
        {
            if (err)
            {
                return exit(err);
            }
            async.each(pms, insertPlayerMatch, function(err)
            {
                if (err)
                {
                    return exit(err);
                }
                match.players = pms;
                updateCache(match, function(err)
                {
                    if (err)
                    {
                        return exit(err);
                    }
                    console.log(match.match_id);
                    stream.resume();
                });
            });
        });
    });
});

function exit(err)
{
    if (err)
    {
        console.error(err);
    }
    process.exit(Number(err));
}

function insertMatch(match, cb)
{
    var obj = serialize(match);
    var query = "INSERT INTO yasp.matches JSON ?";
    cassandra.execute(query, [JSON.stringify(obj)],
    {
        prepare: true
    }, cb);
}

function insertPlayerMatch(pm, cb)
{
    if (pm.account_id === constants.anonymous_account_id)
    {
        delete pm.account_id;
    }
    var obj2 = serialize(pm);
    var query2 = "INSERT INTO yasp.player_matches JSON ?";
    cassandra.execute(query2, [JSON.stringify(obj2)],
    {
        prepare: true
    }, cb);
}
