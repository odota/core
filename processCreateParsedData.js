var utility = require('./utility');
//Correct timeshift, add player slot data for all events collected in buffer
module.exports = function processCreateParsedData(entries, populate)
{
    var parsed_data = utility.getParseSchema();
    for (var i = 0; i < entries.length; i++)
    {
        var e = entries[i];
        populate(e, parsed_data);
    }
    return parsed_data;
};