--leaderboard by max rating
select * from (select distinct on(account_id) * from player_ratings) unique_account_id order by solo_competitive_rank desc nulls last;