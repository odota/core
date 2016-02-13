SELECT *
FROM player_ratings pr
WHERE time = (SELECT MAX(time) from player_ratings WHERE account_id = ?);
AND account_id = ?;