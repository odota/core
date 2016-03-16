select last_hits/10*10 as lh, solo_competitive_rank/100*100 as bin, count(*) from 
(select last_hits, account_id from player_matches order by match_id desc limit 1000000) pm
JOIN player_ratings on pm.account_id = player_ratings.account_id
WHERE time = (select max(time) from player_ratings where account_id = pm.account_id)
GROUP BY bin, lh;