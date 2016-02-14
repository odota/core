SELECT account_id, solo_competitive_rank, time
FROM player_ratings pr
INNER JOIN
    (SELECT account_id, MAX(time) AS MaxTime
    FROM player_ratings
    GROUP BY account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.MaxTime
ORDER BY solo_competitive_rank desc nulls last
LIMIT 1000;