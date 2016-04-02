{{{
  "title": "Complete Match History, Rankings, and Benchmarks!",
  "date": "4-15-2016",
  "author": "Howard",
  "draft": true
}}}

Patch Notes:

* Complete match history.  In order to make our aggregated data more accurate and to improve the experience for new users (no more waiting for full history!), we've spent the last few months going back and adding every public Dota 2 match ever played.
  * All future public matches played will show up as well!
* Rankings.  How do you stack up against other players?  Players are scored on heroes based on ranked games played, win rate, and MMR.  The full details are available on GitHub if you'd like to propose changes to the ranking algorithm.
  * Each hero's top 250 players are shown on the corresponding hero page.
  * Each player page now has a new tab showing their rank and percentile for every hero eligible for ranking.
  * Only ranked games are counted and only players with a publicly shared MMR are eligible for rankings, since MMR is part of the ranking calculation.
* Benchmarks.  See how each hero performs across a variety of stats.
  * We also automatically compute benchmarks for each hero in a match!  See this on each match page.
* Faster player profiles.  Player profiles are now served out of Cassandra.  After an initial slow "cold" load from PostgreSQL, subsequent loads of a player profile should be much faster.Faster

Got questions or feedback?  Come chat with us on Discord.

As always, all of our code remains fully open source and maintained entirely by volunteers.  Want to help out/gain some experience working on an open-source project?  We'd love to help you get started.
