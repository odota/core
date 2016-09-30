function populate(e, container)
{
  switch (e.type)
    {
    case 'interval':
      break;
    case 'player_slot':
      container.players[e.key].player_slot = e.value;
      break;
    case 'chat':
      container.chat.push(JSON.parse(JSON.stringify(e)));
      break;
    case 'cosmetics':
      container.cosmetics = JSON.parse(e.key);
      break;
    case 'CHAT_MESSAGE_TOWER_KILL':
    case 'CHAT_MESSAGE_TOWER_DENY':
    case 'CHAT_MESSAGE_BARRACKS_KILL':
    case 'CHAT_MESSAGE_FIRSTBLOOD':
    case 'CHAT_MESSAGE_AEGIS':
    case 'CHAT_MESSAGE_AEGIS_STOLEN':
    case 'CHAT_MESSAGE_DENIED_AEGIS':
    case 'CHAT_MESSAGE_ROSHAN_KILL':
      container.objectives.push(JSON.parse(JSON.stringify(e)));
      break;
    default:
      if (!container.players[e.slot])
        {
            // couldn't associate with a player, probably attributed to a creep/tower/necro unit
            // console.log(e);
        return;
      }
      var t = container.players[e.slot][e.type];
      if (typeof t === 'undefined')
        {
            // container.players[0] doesn't have a type for this event
            // console.log("no field in parsed_data.players for %s", e.type);
        return;
      }
      else if (e.posData)
        {
            // fill 2d hash with x,y values
        const x = e.key[0];
        const y = e.key[1];
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
            // check if value is greater than what was stored in value prop
        if (e.value > t.value)
            {
          container.players[e.slot][e.type] = e;
        }
      }
      else if (t.constructor === Array)
        {
            // determine whether we want the value only (interval) or everything (log)
            // either way this creates a new value so e can be mutated later
        const arrEntry = (e.interval) ? e.value : (e.type === 'purchase_log' || e.type === 'kills_log') ?
        {
          time: e.time,
          key: e.key,
        } : JSON.parse(JSON.stringify(e));
        t.push(arrEntry);
      }
      else if (typeof t === 'object')
        {
            // add it to hash of counts
        e.value = e.value || 1;
        t[e.key] ? t[e.key] += e.value : t[e.key] = e.value;
      }
      else if (typeof t === 'string')
        {
            // string, used for steam id
        container.players[e.slot][e.type] = e.key;
      }
      else
        {
            // we must use the full reference since this is a primitive type
        container.players[e.slot][e.type] = e.value;
      }
      break;
  }
}
module.exports = populate;
