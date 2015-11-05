SELECT *
FROM player_ratings pr
WHERE time = (SELECT MAX(time) from player_ratings WHERE account_id = 1);
AND account_id = 1;