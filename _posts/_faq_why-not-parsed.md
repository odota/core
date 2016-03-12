{{{
  "title": "Why isn't [some match] being parsed?",
  "tags": ["faq"],
  "date": "2-2-2015 12:05 AM",
  "author": "Admin"
}}}

There are several reasons why we wouldn't have parsed data for a match:

* The replay isn't ready yet.  There is usually a delay after the match (~10 minutes) while we wait for Valve to make the replay downloadable. 

* The replay might not be available.  This happens occasionally, particularly in the SEA region.  If you can't get the replay in the client, we can't get it either.

* The match had no users who've visited recently.  We don't automatically parse these matches because they're unlikely to be looked at.  We still get the basic data from the API, but don't queue it for parse.

* The Dota 2 Network is down.  During server maintenances (usually on Tuesday), we can't get replays until we can connect again.

* The parser crashed while trying to parse the match.  This might happen if something weird happened in the replay file that we didn't expect.

* The replay is expired.  Valve deletes replays after 7 days, so we can't parse these matches.

Since we only parse the replays of active users, we have only parsed a small percentage of all the Dota 2 matches ever played, and only those after August 2014.
This means we probably won't be able to do replay parsing for the majority of your historical matches (from before registration).
