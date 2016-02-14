SELECT * from notable_players
LEFT JOIN 
(SELECT pr.account_id, solo_competitive_rank, time
FROM player_ratings pr
JOIN
    (SELECT account_id, MAX(time) AS MaxTime
    FROM player_ratings
    GROUP BY account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.MaxTime) curr_rating
ON curr_rating.account_id = notable_players.account_id
ORDER BY solo_competitive_rank desc nulls last;