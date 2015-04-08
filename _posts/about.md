{{{
  "title": "About YASP",
  "tags": ["yasp"],
  "date": "4-8-2015",
  "author": "Howard"
}}}

An overview of YASP and its development.

<!--more-->

How To Use
----
Sign in through Steam, and we'll start watching your matches and automatically parse the replays.

Note that probably only a few of your previous matches are listed.  It takes us some time to retrieve your full match history.

We can get API data but cannot parse most full history matches, since most of the replays have expired.

Features
----
* Replay Parsing: Parses replays of Dota 2 matches to provide additional statistics.
  * Item build times
  * Consumables bought
  * Runes picked up
  * Ward placement map
  * LHs per min table
  * Radiant advantage/Gold/XP/LH graphs per min
  * Laning position heatmap
  * Teamfight summary
  * Objective times
  * Ability uses/hits
  * Gold/XP breakdown
  * Damage/Kills breakdown
* Advanced Querying: Supports flexible querying of matches by teammate, team composition, opponent composition, etc.
* Rating Tracking: Users can keep track of their MMR by adding a Steam account to their friends list.
* Visualizations: Data is rendered into bar charts, histograms, heatmaps, and more.
* Modular: You may find certain parts of YASP to be useful for your own needs.
* Scalable: Designed to scale to thousands of users.
* Open Source: Completely free, and welcoming contributions from the Dota 2 developer community

Story
----
Development on YASP began in August 2014, as Albert wanted to look into Dota 2 replay parsing for statistics.

At this time, Howard only wanted to figure out one stat--who he'd played with and win rate with each player.
Albert wanted to try Node.js, and we began working on separate projects to get the stats they wanted.

After some time working separately, we combined projects into a single Node.js application, which became YASP.
The first stats we gathered from replays were per-minute Gold/XP/LH totals, which Albert was most interested in.

Since then, YASP has grown tremendously.  As of April 2015, YASP has parsed over 200,000 replays of over 8000 users.
We're also committed to keeping the service free and our code open source, to encourage involvement from the Dota 2 community.

Name
----
As a fork of Rjacksonm1's matchurls, YASP didn't originally have a name, besides "Dota 2 stats project".

Albert came up with YASP, which originally stood for "Yet Another Stats Page", reflecting the numerous efforts to create Dota 2 statistics websites.

Howard suggested "YASP: Another Stats Page", making it an absolutely hilarious recursive acronym.

Dev Team
----
//TODO: get image dynamically with client side JS?
<div>
<img src="https://avatars2.githubusercontent.com/u/3134520?v=3&s=150"/>
</div>
###Howard Chung:
[howardchung.net](http://howardchung.net)
[/u/suuuncon](http://reddit.com/user/suuuncon)
[YASP](/players/88367253)

Howard's a software engineer (Duke University '15) and casual Dota 2 player.
He loves playing Nature's Prophet, Terrorblade, and Lycan, so he's probably that guy you hate in your pubs.
He also enjoys playing ultimate and board games in his spare time.

Howard works mostly on the backend/parsing and does some work on charts/graphs.
However, he kind of sucks at design, so he's happy to leave that to other members of the team.

<div>
<img src="https://avatars3.githubusercontent.com/u/3838552?v=3&s=150"/>
</div>
###Albert Cui:
[albertcui.com](http://albertcui.com)

Albert came up with the original idea for the site and manages the server deployments.

He's also better at design than Howard is.

<div>
<img src="https://avatars1.githubusercontent.com/u/9388670?v=3&s=150"/>
</div>
###Nicholas Hanson-Holtry:
Nick helps keep YASP running comfortably under max capacity, but Howard and Albert are trying to get him to actually write some code.

<div>
<img src="https://avatars3.githubusercontent.com/u/5741503?v=3&s=150"/>
</div>
###Mei-Vern Then:
Mei-Vern is responsible for our awesome home page and serves as a design consultant when Howard and Albert are struggling with trying to display some new data set.

Tech
----
* Web: Node.js/Express
* Storage: MongoDB/Redis
* Queue Management: Kue
* Client: c3, datatables, cal-heatmap, select2, heatmap.js
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

FAQ
----
###How is YASP different from existing sites?
There are a few things YASP offers that we believe to be unique.
We also believe in deduplication, so we try to focus on features that aren't already done by others.
* Free public match replay parsing.  Other sites offer public match parsing for a fee, or free parsing of professional matches.
* Open source.  We keep our code open source, so anyone can help contribute.
* Better querying tools.  We offer a flexible and powerful querying tool so that users can filter/extract interesting stats from their own match data.

###How do you make money?  Isn't replay parsing is supposed to be expensive?
YASP is a side project of a group of college students.

As such, we're not looking to make money off the site, although we do run ads to help pay for server costs.

We take some cost-cutting measures such as only automatically parsing the replays of active users.

We also sell Cheese to help support our rising hosting costs. Please consider a purchase if you've found the site helpful!

###Why can't I search for players/matches?
To save on storage costs, YASP doesn't have every match ever played.  We only add the matches of users who sign into YASP.

This means you can't arbitrarily search for a match, although if you request a specific match ID through the form, we'll add it.

###Why doesn't (some match) have parsed data?  This site's not any better than other services!
There are several reasons why we wouldn't have parsed data for a match:
* The replay isn't ready yet.  There is usually a delay after the match (~10 minutes) while we wait for Valve to make the replay downloadable. 
* The replay might not be available.  This happens occasionally, particularly in the SEA region, and there's nothing we can do about it.  If you can't get the replay in the client, we can't get it either.
* The parser crashed while trying to parse the match.  This might happen if something weird happened in the replay that our code didn't expect.
* The replay is expired.  Valve deletes replays after 7 days, so we can't parse these matches.

Since we only parse the replays of active YASP users, we have only parsed a small percentage of all the Dota 2 matches ever played, and basically none from January 2015 or earlier.

###I signed in a while ago and just came back to find a lot of matches are "Skipped".  What does that mean?
To keep the load reasonable, we stop automatically parsing matches after a period of inactivity.
Each visit to the YASP site while signed in resets this period.
           
###I just signed in.  Why do you only have five matches for me? Where is my full history?  Your site doesn't work!
Because of our limited resources, we can only track the games of players who use our site.
Upon logging into YASP, we will begin tracking all your games.
We also add you to a queue to get your full history of games.
This can take a while depending on how large the queue is. On average this probably takes a week.
The Valve API limits results to a maximum of 500, so we can only get 500 games per hero per player.
If you really wanted, you could request the remaining matches manually by ID.
                  
###Can I use YASP code in my own project?
YASP is licensed under the GNU GPLv3. 
This means you can use YASP in your project if it is under the same license (free and open source).
We also ask that you give us attribution in your project if you use our code.

###I want to develop a feature/I found a bug!  What do I do?
YASP is open source! Start a thread on GitHub if you'd like to work on a feature or report a bug.

###I can't code, but I still want to help!
If you're not a developer, you can buy some Cheese.