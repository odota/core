{{{
  "title": "Why doesn't [some match] have parsed data?",
  "tags": ["faq"],
  "date": "2-2-2015 12:05 AM",
  "author": "Admin"
}}}

There are several reasons why we wouldn't have parsed data for a match:
* The replay isn't ready yet.  There is usually a delay after the match (~10 minutes) while we wait for Valve to make the replay downloadable. 
* The replay might not be available.  This happens occasionally, particularly in the SEA region.  If you can't get the replay in the client, we can't get it either.
* The match had no active YASP users.  We don't automatically parse these matches because they're unlikely to be looked at.  If it hasn't expired, you can request it.
* The Dota 2 Network is down.  During server maintenances (usually on Tuesday), we can't get replays until we can connect again.
* The match load is very high.  During peak hours, the flow of matches may exceed our parsing capability.  If this happens, the parse delay increases.
* The parser crashed while trying to parse the match.  This might happen if something weird happened in the replay file that we didn't expect.
* The replay is expired.  Valve deletes replays after 7 days, so we can't parse these matches.

Since we only parse the replays of active YASP users, we have only parsed a small percentage of all the Dota 2 matches ever played, and only those after we started operations (August 2014).
