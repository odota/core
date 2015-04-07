{{{ "title": "v3.0.0", "tags": ["release"], "date": "5-1-2015", "author": "Howard" }}}

YASP is proud to present our latest major release, v3.0.0!

<!--more-->

### Features
* Teamfights.  Get a breakdown on the teamfights that occurred during a match!
* Objectives.  See when towers, Roshan, barracks, and the Ancient fell.
* MMR Leaderboard.  See who the top YASP players are!
* Winrate by hour/day.  See when you play at your best!
* Improved largest hit.  See what you hit with, and who you hit hard in each game!
* General match querying (from Matches page)  Run advanced querying on the general match pool.  Wonder how well Terrorblade and Broodmother perform together?  Now you can find out!
* Lifetime totals.  See how many heroes you've killed, and gold you've farmed.
* More sentiment data.  See the keywords we used to determine positivity.

### UI
* Reorganized player pages.  Merged Matches tab, so you can now do match querying directly from your home page.  Aggregations remain on the Trends tab.  The Activity calendar has been moved back to the main page.
* Reordered items in navbar

### Bugfixes
* Some matches may have been missing chat messages.  We've changed our storage format and should now capture chat events that we couldnt link to a player.

### Performance/backend
* Parsed data v7.  Updated format to support more fields.
* Improved frontend dependency management (better maintainability)
* Modified process for retrieving parsed data from DB.  Should lead to better load times for Trends tabs.
* DB data migration.  Converted data from old formats to avoid doing it on-the-fly.