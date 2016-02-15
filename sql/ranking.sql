--per hero rankings for player
/*
select hero_id, percentile from hero_rankings
JOIN (select hero_id, percentile(score) from hero_rankings hr where hero_id = hr.hero_id) pct
ON hero_id = pct.hero_id
where account_id = ?
*/

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

--generate score table
CREATE TABLE hero_rankings AS
SELECT player_matches.account_id, hero_id, count(hero_id) as wins, max(solo_competitive_rank), count(hero_id)*pow(1.0005, max(solo_competitive_rank)) as score
FROM
curr_ratings
JOIN player_matches
ON player_matches.account_id = curr_ratings.account_id
JOIN matches
ON player_matches.match_id = matches.match_id
WHERE (player_slot < 64) = radiant_win
--AND lobby_type = 7 --ranked only?
GROUP BY player_matches.account_id, hero_id;
--WHERE hero_id = 53--debug
--ORDER BY hero_id, score desc;
CREATE INDEX on hero_rankings(hero_id, score);
CREATE INDEX on hero_rankings(account_id);
COMMIT;