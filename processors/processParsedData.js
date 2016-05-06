var utility = require('../util/utility');
var populate = require('./populate');
function processParsedData(entries)
{
    var container = utility.getParseSchema();
    for (var i = 0; i < entries.length; i++)
    {
        var e = entries[i];
        populate(e, container);
    }
    return container;
}

module.exports = processParsedData;