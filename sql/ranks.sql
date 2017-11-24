SELECT rank_tier.rating AS bin, rank_tier.rating as bin_name, count(*)
FROM rank_tier
GROUP BY bin
ORDER BY bin;