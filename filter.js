var constants = require('./constants.js');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
module.exports = function filter(matches, filters) {
    //accept a hash of filters, run all the filters in the hash in series
    //console.log(filters);
    var conditions = {
        //filter: significant, remove unbalanced game modes/lobbies
        significant: function(m, key) {
            return Number(m.isSignificant) === key;
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
        region: function(m, key) {
          return m.region === key;
        },
        date: function(m, key) {
            return m.start_time > (curtime - (key * 86400));
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
            var p = m.purchase;
            return p && item in p;
        },
        included_account_id: function(m, key, arr) {
            return arr.every(function(k) {
                for (var key in m.pgroup){
                    if (m.pgroup[key].account_id === k){
                        return true;
                    }
                }
                return false;
            });
        },
        with_hero_id: function(m, key, arr) {
            return arr.every(function(k) {
                for (var key in m.pgroup){
                    if (m.pgroup[key].hero_id === k && isRadiant(m.pgroup[key]) === isRadiant(m)){
                        return true;
                    }
                }
                return false;
            });
        },
        against_hero_id: function(m, key, arr) {
            return arr.every(function(k) {
                for (var key in m.pgroup){
                    if (m.pgroup[key].hero_id === k && isRadiant(m.pgroup[key]) !== isRadiant(m)){
                        return true;
                    }
                }
                return false;
            });
        }
    };
    var curtime = Math.floor(Date.now() / 1000);
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
