var constants = require('./constants.json');
var utility = require('./utility');
var isRadiant = utility.isRadiant;

function aggHeroes(heroes, m) {
    if (Object.keys(heroes).length !== Object.keys(constants.heroes).length) {
        //prefill heroes with every hero
        for (var hero_id in constants.heroes) {
            var hero = {
                hero_id: hero_id,
                last_played: 0,
                games: 0,
                win: 0,
                with_games: 0,
                with_win: 0,
                against_games: 0,
                against_win: 0
            };
            heroes[hero_id] = heroes[hero_id] || hero;
        }
    }
    var p = m.players[0];
    var player_win = isRadiant(p) === m.radiant_win;
    for (var j = 0; j < m.all_players.length; j++) {
        var tm = m.all_players[j];
        var tm_hero = tm.hero_id;
        if (tm_hero in heroes) {
            //don't count invalid heroes
            if (isRadiant(tm) === isRadiant(p)) {
                //count teammate heroes
                if (tm.account_id === p.account_id) {
                    //console.log("self %s", tm_hero);
                    heroes[tm_hero].games += 1;
                    heroes[tm_hero].win += player_win ? 1 : 0;
                    if (m.start_time > heroes[tm_hero].last_played) {
                        heroes[tm_hero].last_played = m.start_time;
                    }
                }
                else {
                    //console.log("teammate %s", tm_hero);
                    heroes[tm_hero].with_games += 1;
                    heroes[tm_hero].with_win += player_win ? 1 : 0;
                }
            }
            else {
                //count enemy heroes
                //console.log("opp %s", tm_hero);
                heroes[tm_hero].against_games += 1;
                heroes[tm_hero].against_win += player_win ? 1 : 0;
            }
        }
    }
}

function aggTeammates(teammates, m) {
    var p = m.players[0];
    var player_win = isRadiant(p) === m.radiant_win;
    for (var j = 0; j < m.all_players.length; j++) {
        var tm = m.all_players[j];
        //count teammate players
        if (!teammates[tm.account_id]) {
            teammates[tm.account_id] = {
                account_id: tm.account_id,
                last_played: 0,
                win: 0,
                games: 0,
                with_win: 0,
                with_games: 0,
                against_win: 0,
                against_games: 0
            };
        }
        if (m.start_time > teammates[tm.account_id].last_played) {
            teammates[tm.account_id].last_played = m.start_time;
        }
        //played with
        teammates[tm.account_id].games += 1;
        teammates[tm.account_id].win += player_win ? 1 : 0;
        if (isRadiant(tm) === isRadiant(p)) {
            //played with
            teammates[tm.account_id].with_games += 1;
            teammates[tm.account_id].with_win += player_win ? 1 : 0;
        }
        else {
            //played against
            teammates[tm.account_id].against_games += 1;
            teammates[tm.account_id].against_win += player_win ? 1 : 0;
        }
    }
}

function isSignificant(m) {
    //TODO detect no stats recorded?
    return Boolean(constants.game_mode[m.game_mode].balanced && constants.lobby_type[m.lobby_type].balanced);
}
module.exports = {
    aggHeroes: aggHeroes,
    aggTeammates: aggTeammates,
    isSignificant: isSignificant
}