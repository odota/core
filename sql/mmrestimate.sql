select avg(solo_competitive_rank) from player_matches pm 
JOIN player_ratings pr
ON pm.account_id = pr.account_id
where pm.match_id in (select match_id from player_matches where account_id = 88367253 order by match_id desc limit 10)
AND time = (select max(time) from player_ratings where account_id = pm.account_id)
;