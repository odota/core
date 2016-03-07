{{{
  "title": "Rankings and Other Things!",
  "date": "2-22-2016",
  "author": "Howard",
  "draft": true
}}}

Patch Notes:

* Complete match history.  In order to make our aggregated data more accurate and to improve the experience for new users (no more waiting for full history!), we've spent the last few months going back and adding every public Dota 2 match ever played.
  * All future public matches played will show up as well!
  * Features such as rankings, distributions, and picks will benefit from this additional data.
* Rankings.  How do you stack up against other players?  We now score players on heroes based on ranked games played, win rate, and MMR.  The full details are available on GitHub (ranker.js) if you'd like to propose changes to the ranking algorithm.
  * Each hero's top 250 players are shown on the corresponding hero page.
  * Each player page now has a new tab showing their rank and percentile for every hero eligible for ranking.
  * Only ranked games are counted and only players with a publicly shared MMR are eligible for rankings, since MMR is part of the ranking calculation.
* Toplist.  We show the top public players by MMR as well as a list of professional players.
* Skill distribution.  Breaks down the percentage of games in each skill bracket in the last 100,000 games.
* Expanded data for picks.  Previously, this checked the last 50,000 games every hour.  It now counts until we manually reset it and shows the top 1000 picks for each N (1-5).
* Faster player profiles.  We're now using Cassandra to store cached player_match data (needed to build aggregations for player profiles).  After an initial slow "cold" load, subsequent loads of a player profile should be much faster.

I'd also like to mention that the MMR distribution is not limited to players who have signed in (it was for the first few weeks after release).  We now randomly attempt to get MMR for non-anonymous players when the API reports a ranked match finishes.  Therefore the only criteria for being part of the MMR distribution are:
* Share MMR on profile (so we can see it)
* Have "Expose Public Match Data" enabled (so you don't show up as anonymous after a match.  We don't have your ID to request MMR for if you're anonymous!)

Got questions or feedback?  Come chat with us on Discord.

As always, all of our code remains fully open source, and development is done completely by volunteers.  Want to help out/gain some experience working on an open-source project?  We'd love to help you get started.
