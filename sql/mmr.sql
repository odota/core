--number of players in bins of 100
SELECT solo_competitive_rank / 100 AS bin, solo_competitive_rank / 100 * 100 as bin_name, count(*)
FROM player_ratings pr
INNER JOIN
    (SELECT account_id, MAX(time) AS MaxTime
    FROM player_ratings
    GROUP BY account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.MaxTime
WHERE solo_competitive_rank IS NOT NULL
AND solo_competitive_rank > 0
GROUP BY bin
ORDER BY bin;