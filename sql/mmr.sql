SELECT solo_competitive_rank.rating / 100 AS bin, solo_competitive_rank.rating / 100 * 100 as bin_name, count(*)
FROM solo_competitive_rank
GROUP BY bin
ORDER BY bin;