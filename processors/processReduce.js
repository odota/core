/**
 * A processor to reduce the event stream by grouping similar events.
 * NOT CURRENTLY IN PRODUCTION USE
 **/
function processReduce(entries, match)
{
    return entries.filter(function(e)
    {
        if (e.type === "actions")
        {
            return false;
        }
        if (e.type === "interval" && e.time % 60 !== 0)
        {
            return false;
        }
        if (!e.time)
        {
            return false;
        }
        return true;
    }).map(function(e)
    {
        return Object.assign(
        {}, e,
        {
            match_id: match.match_id
        });
    });
}
module.exports = processReduce;