--per hero rankings for player
/*
select hero_id, account_id, percentile from hero_rankings
JOIN (select hero_id, percentile(score) from hero_rankings hr where hero_id = hr.hero_id) pct
ON hero_id = pct.hero_id
where account_id = ?
*/

--begin transaction
--delete table if exists
--generate score table
SELECT wins.account_id, hero_id, wins.count as wins, solo_competitive_rank, wins.count*solo_competitive_rank as score
FROM 
(SELECT player_matches.account_id, hero_id, count(hero_id) from player_matches 
JOIN 
(SELECT match_id, radiant_win, lobby_type from matches order by match_id desc limit 100000) matches
ON player_matches.match_id = matches.match_id
WHERE (player_slot < 64) = radiant_win
--AND lobby_type = 7 --ranked only?
group by player_matches.account_id, hero_id) wins
JOIN player_ratings pr
ON wins.account_id = pr.account_id--only players who have ratings
WHERE time = (SELECT MAX(time) from player_ratings pr2 WHERE wins.account_id = pr2.account_id)
--AND hero_id = 53--debug
AND wins.count >= 10--minimum win count on hero to reduce rows?
ORDER BY score desc
--index by hero_id, score
--index by account_id
--end transaction
