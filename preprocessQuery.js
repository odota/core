module.exports = function(query) {
    //check if we already processed to ensure idempotence
    if (query.processed) {
        return;
    }
    //select,the query received, build the mongo query and the js filter based on this
    query.mongo_select = {};
    query.js_select = {};
    var mongoAble = {
        "players.account_id": 1,
        "leagueid": 1
    };
    var exceptions = {
        "json": 1,
        "compare_account_id": 1
    };
    for (var key in query.select) {
        //arrayify the element
        query.select[key] = [].concat(query.select[key]).map(function(e) {
            if (typeof e === "object") {
                //just return the object if it's an array or object
                return e;
            }
            //numberify this element
            return Number(e);
        });
        if (mongoAble[key]) {
            //get the first element
            query.mongo_select[key] = query.select[key][0];
        }
        else if (!exceptions[key]) {
            query.js_select[key] = query.select[key];
        }
    }
    var default_project = {
        start_time: 1,
        match_id: 1,
        cluster: 1,
        game_mode: 1,
        duration: 1,
        radiant_win: 1,
        parse_status: 1,
        first_blood_time: 1,
        lobby_type: 1,
        leagueid: 1,
        radiant_name: 1,
        dire_name: 1,
        players: 1,
        skill: 1
    };
    query.project = query.project || default_project;
    //only project the fields we need
    query.project["players.account_id"] = 1;
    query.project["players.hero_id"] = 1;
    query.project["players.level"] = 1;
    query.project["players.kills"] = 1;
    query.project["players.deaths"] = 1;
    query.project["players.assists"] = 1;
    query.project["players.gold_per_min"] = 1;
    query.project["players.xp_per_min"] = 1;
    query.project["players.hero_damage"] = 1;
    query.project["players.tower_damage"] = 1;
    query.project["players.hero_healing"] = 1;
    query.project["players.player_slot"] = 1;
    query.project["players.last_hits"] = 1;
    query.project["players.denies"] = 1;
    query.project["players.leaver_status"] = 1;
    //mark this query processed
    query.processed = true;
};