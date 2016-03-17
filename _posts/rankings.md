{{{
  "title": "Complete Match History and Rankings!",
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
* Toplist.  See the top public players by MMR as well as a list of professional players.
* Faster player profiles.  Player profiles are now served out of Cassandra.  After an initial slow "cold" load from PostgreSQL, subsequent loads of a player profile should be much faster.

Note on MMR distribution data:
* I'd also like to reiterate that the MMR distribution is not limited to players who have signed in.  This did apply for the first few weeks after initial publication, leading to some confusion around this.  We now randomly attempt to get MMR for non-anonymous players when the API reports a ranked match finishes.  Therefore the only criteria for being part of the MMR distribution are:
  * Share MMR on profile (so we can see it)
  * Have "Expose Public Match Data" enabled (so you don't show up as anonymous after a match.  We don't have your ID to request MMR for if you're anonymous!)

Got questions or feedback?  Come chat with us on Discord.

As always, all of our code remains fully open source and maintained entirely by volunteers.  Want to help out/gain some experience working on an open-source project?  We'd love to help you get started.
