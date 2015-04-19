FAQ
----
###How is YASP different from existing sites?
There are a few things YASP offers that we believe to be unique.  We also believe in deduplication, so we try to focus on features that aren't already done by others.
* Free public match replay parsing.  Other sites offer public match parsing for a price, or parse only professional matches for free.
* Open source.  We keep our code open source, so anyone can help contribute, or use our code for their own data analysis.
* Better querying.  We offer a flexible and powerful querying tool so that users can filter/extract interesting stats from their own match data.
* Visualizations.  We do some pretty cool visualizations of player match data.

###How do you make money?  Isn't replay parsing supposed to be expensive?
YASP is a side project of a group of college students.  As such, we're not looking to make money off the site.

Here's how we're able to keep YASP running for free:
* Modular, dynamically scalable architecture.  We've separated out YASP into components that we can scale individually.  We end up not paying as much for resources we don't need.
* Reducing load.  For example, we only automatically parse the replays of active users, since those are the matches most likely to be looked at.
* Ads. These help subsidize server costs.
* Donations.  We sell <a href='/carry' target="_blank">Cheese</a> to users who want to help support the site.
* Volunteers.  We don't need to pay employees as all developers are volunteers.

Anything that's left, we cover out-of-pocket!

###Why can't I search for players/matches?
To save on storage costs, YASP doesn't have every match ever played.  We only add the matches of users who sign in.

While we COULD implement a search function, you probably won't be able to find most matches if you search for an ID at random.

However, if you request a specific match ID through the request form, we'll add it and try to parse it as well!

###Why doesn't (some match) have parsed data?
There are several reasons why we wouldn't have parsed data for a match:
* The replay isn't ready yet.  There is usually a delay after the match (~10 minutes) while we wait for Valve to make the replay downloadable. 
* The replay might not be available.  This happens occasionally, particularly in the SEA region.  If you can't get the replay in the client, we can't get it either.
* The match had no active YASP users.  We don't automatically parse these matches because they're unlikely to be looked at.  If it hasn't expired, you can request it.
* The parser crashed while trying to parse the match.  This might happen if something weird happened in the replay file that we didn't expect.
* The replay is expired.  Valve deletes replays after 7 days, so we can't parse these matches.

Since we only parse the replays of active YASP users, we have only parsed a small percentage of all the Dota 2 matches ever played, and basically none from January 2015 or earlier.

###I signed in a while ago and just came back to find a lot of matches are "Skipped".  What does that mean?
To keep the load reasonable, we stop automatically parsing matches after a period of inactivity.
Each visit to the YASP site while signed in resets this period.
           
###I just signed in.  Why do you only have five matches for me?  Your site doesn't work!
When you first log in, the games we have are games where you played with a YASP user.
We begin watching your games after the first login.
You're also added to a queue to get your full match history.  This can take a while depending on how long the queue is.

Note on full history: due to Valve API limitations, we can only get 500 games per hero per player.
If you really wanted, you could request the remaining matches manually by ID.

###Can I use YASP code in my own project?
YASP is licensed under the GNU GPLv3. 
This means you can use YASP if your project is under the same license (free and open source).
We also ask that you give us attribution in your project if you use our code.

###I want to develop a feature/I found a bug!  What do I do?
Start a thread on GitHub if you'd like to work on a feature or report a bug.

###I can't code, but I still want to help!
If you're not a developer, you can buy some Cheese.