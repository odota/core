module.exports = {
    "players":
    {
        "name": "Players",
        "sql": `
SELECT * from notable_players;
            `,
    },
    "players_most_damage":
    {
        "name": "Players, most damage dealt",
        "sql": `
SELECT pm.account_id, name, sum(hero_damage) as sum
FROM player_matches pm
JOIN matches m
ON m.match_id = pm.match_id
JOIN notable_players np
ON pm.account_id = np.account_id
GROUP BY pm.account_id, name
ORDER BY sum desc NULLS LAST
LIMIT 100;
            `,
    },
    /*
        "players_most_damage_taken":
        {
            "name": "Players, most damage taken",
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
    WHERE type = "DOTA_COMBATLOG_DAMAGE"
    GROUP BY pm.account_id, name
    ORDER BY sum desc;
                `,
        },
        */
    "players_most_healing":
    {
        "name": "Players, most healing",
        "sql": `
SELECT pm.account_id, name, sum(hero_healing) as sum
FROM player_matches pm
JOIN matches m
ON m.match_id = pm.match_id
JOIN notable_players np
ON pm.account_id = np.account_id
GROUP BY pm.account_id, name
ORDER BY sum desc NULLS LAST
LIMIT 100;
        `,
    },
    "players_most_tower_damage":
    {
        "name": "Players, most tower damage",
        "sql": `
SELECT pm.account_id, name, sum(tower_damage) as sum
FROM player_matches pm
JOIN matches m
ON m.match_id = pm.match_id
JOIN notable_players np
ON pm.account_id = np.account_id
GROUP BY pm.account_id, name
ORDER BY sum desc NULLS LAST
LIMIT 100;
        `,
    },
    "players_most_lh10":
    {
        "name": "Players, most LH@10",
        "sql": `
SELECT lh_t[10], np.name, m.match_id, le.name as leaguename
FROM matches m
JOIN player_matches pm
ON m.match_id = pm.match_id
JOIN notable_players np
ON pm.account_id = np.account_id
JOIN leagues le
ON m.leagueid = le.leagueid
ORDER BY lh_t DESC NULLS LAST
LIMIT 100;
            `,
    },
    /*
    "players_fastest_manta":
    {
        "name": "Players, fastest Manta",
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
WHERE type = "DOTA_COMBATLOG_PURCHASE"
AND valuename = "item_manta"
ORDER BY time ASC
LIMIT 100;
        `,
    },
    */
    "players_most_games":
    {
        "name": "Players, most pro games",
        "sql": `
SELECT pm.account_id, np.name,
count(*),
sum(case when ((pm.player_slot < 128) = m.radiant_win) then 1 else 0 end) wins
FROM player_matches pm
JOIN notable_players np
ON pm.account_id = np.account_id
JOIN matches m
ON pm.match_id = m.match_id
GROUP BY pm.account_id, np.name
ORDER BY count DESC;
        `,
    },
    "players_most_games_abaddon":
    {
        "name": "Players, most pro games on Abaddon",
        "sql": `
SELECT pm.account_id, np.name,
count(*),
sum(case when ((pm.player_slot < 128) = m.radiant_win) then 1 else 0 end) wins
FROM player_matches pm
JOIN notable_players np
ON pm.account_id = np.account_id
JOIN matches m
ON pm.match_id = m.match_id
WHERE pm.hero_id = 1
GROUP BY pm.account_id, np.name
ORDER BY count DESC;
            `,
    },
    "players_most_games_furion":
    {
        "name": "Players, most pro games on Nature's Prophet",
        "sql": `
SELECT pm.account_id, np.name,
count(*),
sum(case when ((pm.player_slot < 128) = m.radiant_win) then 1 else 0 end) wins
FROM player_matches pm
JOIN notable_players np
ON pm.account_id = np.account_id
JOIN matches m
ON pm.match_id = m.match_id
WHERE pm.hero_id = 53
GROUP BY pm.account_id, np.name
ORDER BY count DESC;
            `,
    },
    "player_most_midas":
    {
                "name": "Players, most pro games on Nature's Prophet",
        "sql": `
SELECT pm.account_id, np.name,
sum((purchase->>'hand_of_midas')::int)
FROM player_matches pm
JOIN notable_players np
ON pm.account_id = np.account_id
JOIN matches m
ON pm.match_id = m.match_id
GROUP BY pm.account_id, np.name
ORDER BY sum DESC NULLS LAST;
            `,
    },
    "heroes_most_picked_banned":
    {
        "name": "Heroes, most picked/banned",
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
    "heroes_most_midas":
    {
        "name": "",
        "sql": `
SELECT hero_id, sum((purchase->>'hand_of_midas')::int)
FROM player_matches
GROUP by hero_id
ORDER by sum DESC NULLS LAST;
    `,
    },
    "matches_most_recent":
    {
        "name": "Matches, most recent",
        "sql": `
SELECT match_id, t1.name AS radiant_team_name, t2.name AS dire_team_name, le.name, start_time, duration
FROM matches ma
JOIN leagues le
ON ma.leagueid = le.leagueid
LEFT JOIN teams t1
ON radiant_team_id = t1.team_id
LEFT JOIN teams t2
ON dire_team_id = t2.team_id
WHERE ma.leagueid > 0
ORDER BY match_id DESC
LIMIT 100;
            `,
    },
    /*
        "metadata_columns":
        {
            "name": "Metadata, columns",
            "sql": `
    SELECT *
    FROM information_schema.columns
    WHERE table_schema = "public";
            `,
        },
        */
};