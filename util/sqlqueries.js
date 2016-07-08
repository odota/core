module.exports = [
{
    "name": 'Players, most damage dealt',
    "sql": `
    SELECT pm.account_id, name, sum(value) as sum
    FROM match_logs ml
    JOIN player_matches pm
    ON ml.sourcename_slot = pm.player_slot
    AND ml.match_id = pm.match_id
    JOIN matches m
    ON m.match_id = ml.match_id
    JOIN notable_players np
    ON pm.account_id = np.account_id
    WHERE type = 'DOTA_COMBATLOG_DAMAGE'
    GROUP BY pm.account_id, name
    ORDER BY sum desc;
            `,
},
{
    "name": 'Players, most damage taken',
    "sql": `
    SELECT pm.account_id, name, sum(value) as sum
    FROM match_logs ml
    JOIN player_matches pm
    ON ml.targetname_slot = pm.player_slot
    AND ml.match_id = pm.match_id
    JOIN matches m
    ON m.match_id = ml.match_id
    JOIN notable_players np
    ON pm.account_id = np.account_id
    WHERE type = 'DOTA_COMBATLOG_DAMAGE'
    GROUP BY pm.account_id, name
    ORDER BY sum desc;
            `,
},
{
    "name": 'Players, most LH@10',
    "sql": `
    SELECT lh, pm.account_id, name
    FROM match_logs ml
    JOIN player_matches pm
    ON ml.player_slot = pm.player_slot
    AND ml.match_id = pm.match_id
    JOIN notable_players np
    ON pm.account_id = np.account_id
    WHERE time = 600
    ORDER BY lh desc;
            `,
},
{
    "name": 'Players, most healing',
    "sql": `
    SELECT pm.account_id, name, sum(value) as sum
    FROM match_logs ml
    JOIN player_matches pm
    ON ml.targetname_slot = pm.player_slot
    AND ml.match_id = pm.match_id
    JOIN matches m
    ON m.match_id = ml.match_id
    JOIN notable_players np
    ON pm.account_id = np.account_id
    WHERE type = 'DOTA_COMBATLOG_HEAL'
    GROUP BY pm.account_id, name
    ORDER BY sum desc;
        `,
},
{
    "name": 'Players, fastest Manta',
    "sql": `
    SELECT time, valuename, pm.account_id, name, m.match_id, leagueid
    FROM match_logs ml
    JOIN matches m
    ON m.match_id = ml.match_id
    JOIN player_matches pm
    ON ml.match_id = pm.match_id
    AND ml.targetname_slot = pm.player_slot
    JOIN notable_players np
    ON pm.account_id = np.account_id
    WHERE type = 'DOTA_COMBATLOG_PURCHASE'
    AND valuename = 'item_manta'
    ORDER BY time ASC
    LIMIT 100;
        `,
},
{
    "name": 'Players, most pro games',
    "sql": `
    SELECT pm.account_id, np.name, count(*)
    FROM player_matches pm
    JOIN notable_players np
    ON pm.account_id = np.account_id
    GROUP BY pm.account_id, np.name
    ORDER BY count DESC;
        `,
},
{
    "name": 'Heroes, most picked/banned',
    "sql": `
    SELECT pb.hero_id,
    sum(case when ((pm.player_slot < 128) = m.radiant_win) then 1 else 0 end) wins, 
    sum(case when is_pick is true then 1 else 0 end) picks,
    sum(case when is_pick is false then 1 else 0 end) bans
    FROM picks_bans pb
    LEFT JOIN matches m
    ON pb.match_id = m.match_id
    LEFT JOIN player_matches pm
    ON pb.hero_id = pm.hero_id
    AND pm.match_id = m.match_id
    GROUP BY pb.hero_id
    ORDER BY picks DESC;
            `,
},
{
    "name": 'Matches, most recent',
    "sql": `
    SELECT match_id, start_time, duration, ma.leagueid, name
    FROM matches ma
    JOIN leagues le
    ON ma.leagueid = le.leagueid
    WHERE ma.leagueid > 0
    ORDER BY match_id DESC
    LIMIT 100;
            `,
},
{
    "name": 'Players',
    "sql": `
    SELECT * from notable_players;
            `,
},
{
    "name": "Metadata, available columns",
    "sql": `
    SELECT *
    FROM information_schema.columns
    WHERE table_schema = 'public';
        `,
}];