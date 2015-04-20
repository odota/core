{{{ "title": "v3.0.0", "tags": ["release"], "date": "4-20-2015", "author": "Howard and Albert" }}}

YASP is proud to present our latest major release, v3.0.0!

<!--more-->

### Features
* <a href="http://yasp.co/matches/1408333834/teamfights" target="_blank">Teamfights</a>: Get a breakdown on the teamfights that occurred during a match!
* <a href="http://yasp.co/matches/1408333834/objectives" target="_blank">Objectives</a>:  See when towers, Roshan, and barracks fell.
* Winrate by hour/day.  See when you play at your best!
* Improved histograms.  See winrate per bucket for categories such as Duration/K/D/A!
* Improved largest hit.  Find out what you hit with, and who you hit hardest in each game.
* Lifetime totals.  Reflect on how many heroes you've killed and how much gold you've farmed, etc.
* More sentiment data.  Check out the keywords we used to determine positivity.
* <a href="http://yasp.co/ratings" target="_blank">MMR Leaderboard</a>:  See who the top rated YASP players are!

### UI
* Reorganized player pages.  Match querying now available directly from profile page.
* Reordered items in navbar.

### Bugfixes
* Some matches may have been missing chat messages.  We've changed our storage format and should now capture chat events that we couldnt link to a player.

### Performance/backend
* Parsed data v7.  Updated format to support more fields.
* Improved frontend dependency management (better maintainability)
* Modified process for retrieving parsed data from DB.  Should lead to better load times.
* DB data migration.  Converted data from old formats to avoid doing it on-the-fly.

Again, thanks a lot for all your support! Please consider some [cheese](http://yasp.co/carry) or help spread the word out about YASP!

-Howard and Albert (The YASP Team!)
