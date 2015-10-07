var constants = require('./constants.js');
var utility = require('./utility');
var isSignificant = utility.isSignificant;
var isRadiant = utility.isRadiant;
module.exports = function filter(matches, groups, filters) {
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
            return m.hero_id === key;
        },
        isRadiant: function(m, key) {
            return Number(m.isRadiant) === key;
        },
        lane_role: function(m, key) {
            return m.lane_role === key;
        },
        purchased_item: function(m, key) {
            var item = constants.item_ids[key];
            var pt = m.purchase_time;
            return pt && item in pt;
        },
        included_account_id: function(m, key, arr) {
            return arr.every(function(k) {
                return groups[m.match_id].some(function(p) {
                    return p.account_id === k;
                });
            });
        },
        with_hero_id: function(m, key, arr) {
            return arr.every(function(k) {
                return groups[m.match_id].some(function(p) {
                    return (p.hero_id === k && isRadiant(p) === isRadiant(m));
                });
            });
        },
        against_hero_id: function(m, key, arr) {
            return arr.every(function(k) {
                return groups[m.match_id].some(function(p) {
                    return (p.hero_id === k && isRadiant(p) !== isRadiant(m));
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
                //pass the player_match, the first element of array, and the array itself
                include = include && conditions[key](matches[i], filters[key][0], filters[key]);
            }
        }
        //if we passed, push it
        if (include) {
            filtered.push(matches[i]);
        }
    }
    return filtered;
};