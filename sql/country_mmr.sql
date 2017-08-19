SELECT loccountrycode, 
       count(*), 
       round(avg(solo_competitive_rank.rating)) as avg
FROM   players
JOIN solo_competitive_rank using(account_id)
WHERE  loccountrycode IS NOT NULL
GROUP  BY loccountrycode 
ORDER  BY avg DESC; 