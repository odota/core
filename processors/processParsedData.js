var utility = require('../util/utility');
module.exports = function processParsedData(entries, meta, populate)
{
    var container = utility.getParseSchema();
    for (var i = 0; i < entries.length; i++)
    {
        var e = entries[i];
        populate(e, container);
    }
    return container;
};
