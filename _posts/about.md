{{{
  "title": "About YASP",
  "tags": ["yasp"],
  "date": "4-8-2015",
  "author": "Howard"
}}}

An overview of YASP and its development.

<!--more-->

How To
====
Sign in through Steam, and we'll start watching your matches and automatically parse the replays.
Note that probably only a few of your previous matches are listed.
We'll get your full history after some time.
We can get API data but cannot parse most full history matches, since most of the replays have expired.
We can only get a limited number of full histories per day, so please be patient.

Features
====
* Replay Parsing: Parses replays of Dota 2 matches to provide additional statistics, including item build times and ward placement.
* Advanced Querying: Supports flexible querying of matches by teammate, team composition, opponent composition, etc.
* Rating Tracking: Users can keep track of their MMR by adding a Steam account to their friends list.
* Visualizations: Data is rendered into bar charts, histograms, heatmaps, and more.
* Modular: You may find certain parts of YASP to be useful for your own needs.
* Scalable: Designed to scale to thousands of users.
* Open Source: Completely free, and welcoming contributions from the Dota 2 developer community

Story
====
Development on YASP began in August 2014, as Albert wanted to look into Dota 2 replay parsing for statistics.
At this time, Howard only wanted to figure out one stat--who he'd played with and win rate with each player.
Howard was a Rails kind of guy, while Albert wanted to look into using Node.js.
After some time working separately, they decided to combine their projects into a single Node.js application, which became YASP.
The first stats we gathered were per-minute Gold/XP/LH totals, which Albert was most interested in.

Since then, YASP has grown tremendously.  As of April 2015, YASP has parsed over 200,000 replays of over 8000 users.
We're also committed to keeping the service free and our code open source, to encourage involvement from the Dota 2 community.

Name
====
As a fork of Rjacksonm1's matchurls, YASP didn't originally have a name, besides "Dota 2 stats project"
Albert came up with YASP, which originally stood for "Yet Another Stats Page", reflecting the numerous efforts to create Dota 2 statistics platforms.
Howard suggested "YASP: Another Stats Page", making it an absolutely hilarious recursive acronym.

Dev Team
====
<div>
<img style="height:150px;" src="https://cdn.rawgit.com/howardc93/howardc93.github.io/master/public/profile.jpg"/>
</div>
##Howard Chung (howardchung.net):
Howard's a software engineer (Duke University '15) and Dota 2 player.  He also enjoys playing ultimate and board games in his spare time.
Howard works mostly on the backend/parsing and does some work on charts/graphs.
However, he kind of sucks at design, so he's happy to leave that to other members of the team.

##Albert Cui:

##Nicholas Hanson-Holtry:

##Mei-Vern Then:

##Vincent Wang:


Tech
====
* Web: Node.js/Express
* Persistence: MongoDB/Redis
* Queue Management: Kue
* Client: c3, datatables, cal-heatmap, select2, heatmap.js
* Parser: Java (with [clarity](https://github.com/skadistats/clarity))

FAQ
====
##How do you make money/keep the site running?  Replay parsing is supposed to be too expensive to offer for free.  This sounds too good to be true!
YASP is a side project of a group of college students.
As such, we're not looking to make money off the site, although we do run ads to help pay for server costs.
We also sell Cheese to help support our rising hosting costs. Please consider a purchase if you've found the site helpful!

##Why can't I search for players/matches?
To save on storage costs, YASP doesn't have every match ever played.  We only add the matches of users who sign into YASP.
This means you can't arbitrarily search for a match, although if you request a specific match ID through the form, we'll add it.

##Why doesn't (some match) have parsed data?  This site's not any better than other services!
There is usually a delay after the match (~10 minutes) while we wait for Valve to make the replay downloadable. After that, the replay might not be available, which happens occasionally (particularly in the SEA region). Alternatively, our parser couldn&apos;t process the match. We&apos;re always looking for bugs and re-parsing matches when we can.  Finally, we can't parse matches older than 7 days as the replay has expired.
                  
##I signed in a while ago and just came back to find a lot of matches are "Skipped".  What does that mean?
To keep the load reasonable, we stop automatically parsing matches after a period of inactivity.  Each visit to the YASP site while signed in resets this period.
           
##I just signed in.  Why do you only have five matches for me? Where is my full history?  Your site doesn't work!
Because of our limited resources, we can only track the games of players who use our site. Upon logging into YASP, we will begin tracking all your games.
We also add you to a queue to get your full history of games. This can take a while depending on how large the queue is. On average this probably takes a week.
The Valve API limits results to a maximum of 500, so we can only get 500 games per hero per player.
If you really wanted, you could request the remaining matches manually by ID. . .
                  
##Can I use YASP code in my own project?
YASP is licensed under the GNU GPLv3. This means you can use YASP in your project if your project is also free and open source. We also ask that you give us attribution in your project if you use our code.

##I want to develop a feature/I found a bug!  What do I do?
YASP is open source! Start a thread on GitHub if you&apos;d like to work on a feature. 

##I can't code, but I still want to help!
If you&apos;re not a developer, you can buy some Cheese.