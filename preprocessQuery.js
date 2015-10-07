var constants = require('./constants.js');
module.exports = function(query, account_id) {
    //check if we already processed to ensure idempotence
    if (query.processed) {
        return;
    }
    //select,the query received, build the mongo query and the js filter based on this
    query.db_select = {};
    query.js_select = {};
    var dbAble = {
        "account_id": 1,
        "leagueid": 1
    };
    var exceptions = {
        "json": 1,
        "compare_account_id": 1
    };
    var whitelist = {
        "all": 5000
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
        if (dbAble[key]) {
            //get the first element
            query.db_select[key] = query.select[key][0];
        }
        else if (!exceptions[key]) {
            query.js_select[key] = query.select[key];
        }
    }
    if (Number(account_id) === constants.anonymous_account_id) {
        return null;
    }
    if (!isNaN(Number(account_id))) {
        query.db_select.account_id = Number(account_id);
    }
    else if (account_id in whitelist) {
        query.limit = whitelist[account_id];
    }
    else {
        return null;
    }
    //mark this query processed
    query.processed = true;
    return query;
};