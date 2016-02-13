var fs = require('fs');
var input = fs.createReadStream('./output.json');
var parseStream = require('ndjson').parse();
var entries = [];
var processMetadata = require('../processMetadata');
var processExpand = require('../processExpand');
var processTeamfights = require('../processTeamfights');
var processAllPlayers = require('../processAllPlayers');
input.pipe(parseStream);
parseStream.on('data', function handleStream(e)
{
    entries.push(e);
});
parseStream.on('end', exit);
parseStream.on('error', exit);

function exit(err)
{
    if (!err)
    {
        var message = "time spent on post-processing match ";
        console.time(message);
        var meta = processMetadata(entries);
        var res = processExpand(entries, meta, populate);
        //var parsed_data = res.parsed_data;
        //parsed_data.teamfights = processTeamfights(res.expanded, meta, populate);
        //var ap = processAllPlayers(res.expanded);
        //parsed_data.radiant_gold_adv = ap.radiant_gold_adv;
        //parsed_data.radiant_xp_adv = ap.radiant_xp_adv;
        //parsed_data.duration = meta.game_end - meta.game_zero;
        //processMultiKillStreaks();
        //processReduce(res.expanded);
        console.timeEnd(message);
    }
}

function populate(e, container)
{
    switch (e.type)
    {
        /*
        case 'epilogue':
            var dota = JSON.parse(e.key).gameInfo_.dota_;
            //container.match_id = dota.matchId_;
            container.game_mode = dota.gameMode_;
            container.radiant_win = dota.gameWinner_ === 2;
            //following needs some extraction/transformation
            //container.picks_bans = dota.picksBans_; 
            //require('fs').writeFileSync('./outputEpilogue.json', JSON.stringify(JSON.parse(e.key)));
            break;
        case 'interval':
            container.players[e.slot].hero_id = e.hero_id;
            break;
        case 'player_slot':
            container.players[e.key].player_slot = e.value;
            break;
        case 'match_id':
            container.match_id = e.value;
            break;
        case 'chat':
            container.chat.push(JSON.parse(JSON.stringify(e)));
            break;
        case 'CHAT_MESSAGE_TOWER_KILL':
        case 'CHAT_MESSAGE_TOWER_DENY':
        case 'CHAT_MESSAGE_BARRACKS_KILL':
        case 'CHAT_MESSAGE_FIRSTBLOOD':
        case 'CHAT_MESSAGE_AEGIS':
        case 'CHAT_MESSAGE_AEGIS_STOLEN':
        case 'CHAT_MESSAGE_AEGIS_DENIED':
        case 'CHAT_MESSAGE_ROSHAN_KILL':
            container.objectives.push(JSON.parse(JSON.stringify(e)));
            break;
            */
        default:
            if (!container.players[e.slot])
            {
                //couldn't associate with a player, probably attributed to a creep/tower/necro unit
                //console.log(e);
                return;
            }
            var t = container.players[e.slot][e.type];
            if (typeof t === "undefined")
            {
                //container.players[0] doesn't have a type for this event
                //console.log("no field in parsed_data.players for %s", e.type);
                return;
            }
            else if (e.posData)
            {
                //fill 2d hash with x,y values
                var x = e.key[0];
                var y = e.key[1];
                if (!t[x])
                {
                    t[x] = {};
                }
                if (!t[x][y])
                {
                    t[x][y] = 0;
                }
                t[x][y] += 1;
            }
            else if (e.max)
            {
                //check if value is greater than what was stored
                if (e.value > t.value)
                {
                    container.players[e.slot][e.type] = e;
                }
            }
            else if (t.constructor === Array)
            {
                //determine whether we want the value only (interval) or the time and key (log)
                //either way this creates a new value so e can be mutated later
                var arrEntry = (e.interval) ? e.value :
                {
                    time: e.time,
                    key: e.key
                };
                t.push(arrEntry);
            }
            else if (typeof t === "object")
            {
                //add it to hash of counts
                e.value = e.value || 1;
                t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
            }
            else if (typeof t === "string")
            {
                //string, used for steam id
                container.players[e.slot][e.type] = e.key;
            }
            else
            {
                //we must use the full reference since this is a primitive type
                //use the value most of the time, but key when stuns since value only holds Integers in Java
                //replace the value directly
                container.players[e.slot][e.type] = e.value || Number(e.key);
            }
            break;
    }
}