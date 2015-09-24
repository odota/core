var constants = require('./constants.json');
var utility = require('./utility');
var isSignificant = utility.isSignificant;
var isRadiant = utility.isRadiant;
module.exports = function filter(matches, filters) {
    //accept a hash of filters, run all the filters in the hash in series
    //console.log(filters);
    var conditions = {
        //filter: significant, remove unbalanced game modes/lobbies
        significant: function(m, key) {
            return Number(isSignificant(constants, m)) === key;
        },
        //filter: player won
        win: function(m, key) {
            return Number(m.player_win) === key;
        },
        patch: function(m, key) {
            return m.patch === key;
        },
        game_mode: function(m, key) {
            return m.game_mode === key;
        },
        lobby_type: function(m, key) {
            return m.lobby_type === key;
        },
        hero_id: function(m, key) {
            return m.players[0].hero_id === key;
        },
        isRadiant: function(m, key) {
            return Number(m.players[0].isRadiant) === key;
        },
        lane_role: function(m, key) {
            return m.players[0].parsedPlayer.lane_role === key;
        },
        purchased_item: function(m, key) {
            var item = constants.item_ids[key];
            var pt = m.players[0].parsedPlayer.purchase_time;
            return pt && item in pt;
        },
        //GETFULLPLAYERDATA: we need to iterate over match.all_players
        //ensure all array elements fit the condition
        included_account_id: function(m, key, arr) {
            return arr.every(function(k) {
                return m.all_players.some(function(p) {
                    return p.account_id === k;
                });
            });
        },
        with_hero_id: function(m, key, arr) {
            return arr.every(function(k) {
                return m.all_players.some(function(p) {
                    return (p.hero_id === k && isRadiant(p) === isRadiant(m.players[0]));
                });
            });
        },
        against_hero_id: function(m, key, arr) {
            return arr.every(function(k) {
                return m.all_players.some(function(p) {
                    return (p.hero_id === k && isRadiant(p) !== isRadiant(m.players[0]));
                });
            });
        }
    };
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
        var include = true;
        //verify the match passes each filter test
        for (var key in filters) {
            if (conditions[key]) {
                //earlier, we arrayified everything
                //pass the first element, as well as the full array
                //check that it passes all filters
                include = include && conditions[key](matches[i], filters[key][0], filters[key]);
            }
        }
        //if we passed, push it
        if (include) {
            filtered.push(matches[i]);
        }
    }
    return filtered;
}