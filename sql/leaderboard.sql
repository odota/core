SELECT pr.account_id, solo_competitive_rank, time, personaname
FROM player_ratings pr
JOIN
    (SELECT account_id, MAX(time) AS MaxTime
    FROM player_ratings
    GROUP BY account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.MaxTime
JOIN players
ON pr.account_id = players.account_id
LEFT JOIN player_names
ON pr.account_id = player_names.account_id
ORDER BY solo_competitive_rank desc nulls last
LIMIT 1000;