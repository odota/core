START TRANSACTION;
DROP TABLE IF EXISTS hero_rankings;

CREATE TEMPORARY TABLE curr_ratings ON COMMIT DROP AS
(SELECT pr.account_id, solo_competitive_rank from player_ratings pr
JOIN 
(select account_id, max(time) as maxtime from player_ratings GROUP by account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.maxtime
--WHERE pr.time > now() - INTERVAL '7 days' --rating isn't stale
);

--generate initial score table
CREATE TABLE hero_rankings AS
SELECT player_matches.account_id, hero_id, count(hero_id) as games, sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end) as wins, solo_competitive_rank, (count(hero_id)) * (count(hero_id) / (count(hero_id)-sum(case when ((player_slot < 64) = radiant_win) then 1 else 0 end)+1)) * solo_competitive_rank as score
FROM
curr_ratings
JOIN player_matches
ON player_matches.account_id = curr_ratings.account_id
JOIN matches
ON player_matches.match_id = matches.match_id
WHERE lobby_type = 7
GROUP BY player_matches.account_id, hero_id, solo_competitive_rank
WHERE games >= 10;

CREATE INDEX on hero_rankings(hero_id, score);
ALTER TABLE hero_rankings ADD PRIMARY KEY(account_id, hero_id);
COMMIT;