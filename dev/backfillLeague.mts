// Backfill matches for leagues (including amateur) from GetMatchHistory using:
// https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/v1/?key=X&league_id=17211
// Can fetch up to 500 matches per league
// We might have more than 500 in some pro leagues? can query existing matches table for that