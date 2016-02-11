--per hero rankings for player
/*
select hero_id, percentile from hero_rankings
JOIN (select hero_id, percentile(score) from hero_rankings hr where hero_id = hr.hero_id) pct
ON hero_id = pct.hero_id
where account_id = ?
*/

--begin transaction
--delete table if exists
DROP TABLE IF EXISTS hero_rankings;
--generate score table
CREATE TABLE hero_rankings AS
SELECT wins.account_id, hero_id, wins.count as wins, solo_competitive_rank, wins.count*pow(1.0005, solo_competitive_rank) as score
FROM 
(SELECT player_matches.account_id, hero_id, count(hero_id) from player_matches 
JOIN 
(SELECT match_id, radiant_win, lobby_type from matches) matches
ON player_matches.match_id = matches.match_id
WHERE (player_slot < 64) = radiant_win
--AND lobby_type = 7 --ranked only?
group by player_matches.account_id, hero_id) wins
JOIN 
(SELECT pr.account_id, solo_competitive_rank from player_ratings pr
JOIN 
(select account_id, max(time) as maxtime from player_ratings GROUP by account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.maxtime
WHERE pr.time > now() - INTERVAL '1 days' --rating isn't stale
) curr_ratings
ON wins.account_id = curr_ratings.account_id
--WHERE hero_id = 53--debug
ORDER BY hero_id, score desc;
--index by hero_id, score
--index by account_id
--end transaction

SELECT * from player_ratings pr
JOIN 
(select account_id, max(time) as maxtime from player_ratings GROUP by account_id) grouped
ON pr.account_id = grouped.account_id
AND pr.time = grouped.maxtime
--WHERE time > now() - INTERVAL '1 days';