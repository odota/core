YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Join the chat at https://gitter.im/yasp-dota/yasp](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/yasp-dota/yasp?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

How To Use
----
Sign in through Steam, and we'll start watching your matches and automatically parse the replays.

Note that probably only a few of your previous matches are listed.  It takes us some time to retrieve your full match history.

We can get basic match data but cannot parse matches where the replays have expired.

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
  * Largest hit on a hero
* Advanced Querying: Supports flexible querying and aggregation with the following criteria:
  * player(s) in game (account ID)
  * team composition (heroes)
  * opponent composition (heroes)
  * Standard filters: patch, game mode, etc.
* Aggregations:
  * Result count, win rate
  * Win rate by hour/day of week
  * Hero Matchups (win rate when playing as, with, against a hero)
  * Teammates (win rate playing with particular players)
  * Histogram (number of matches across Duration, LH, HD, TD, K, D, A, etc.)
  * Max/N/Sum on multiple stat categories
* Additional aggregations for parsed matches:
  * Mean build times
  * Skill accuracy
  * Laning
  * Ward Map
* Rating Tracking: Users can keep track of their MMR by adding a Steam account to their friends list.
* Visualizations: Data is rendered into timeseries graphs, bar charts, histograms, heatmaps, and more.
* Modular: You may find certain parts of YASP to be useful for your own needs.
* Scalable: Designed to scale to thousands of users.
* Free: YASP has no "premium" features--everything is free for everyone!
* Open Source: YASP encourages contributions from the Dota 2 developer community.

Tech
----
* Web: Node.js/Express
* Storage: MongoDB/Redis
* Queue Management: Kue
* Client: Bootstrap, c3, datatables, cal-heatmap, select2, heatmap.js, qtip2
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart
----
* Development mode: Runs yasp-core, parser, retriever on one machine
* Install dependencies: `sudo bash init.sh`
* Create .env file with required config values in KEY=VALUE format (see config.js null values) `touch .env`
* Build `npm run build`
* Launch in dev mode: `npm run dev`

Sample Data
----
* Load the test players and matches: `mongo dota migrations/loader.js`

Lessons and Rules
----
* Never async.parallel database calls.

Developer Questions
----
###How do I programmatically get replays?
* You can fire up the retriever (supplying your own Steam credentials) and basically get a REST API for retrieving replay salts.  
* If you have friends on that account you could extract their MMR as well.

###How do I use the parser?
* You'll probably need to download the replays and pipe them through the parser (it uses stdin/stdout streams, so standard shell redirection will work).
* This just emits a raw event log of JSON objects.  You'll have to figure out what you want to do with that data.
* In YASP, we aggregate that data into a single JSON object and store it in MongoDB, then display it nicely with our Jade templates.

###I've got a bunch of replay files.  Can I get them into YASP?
* If you want to run a replay file through the YASP pipeline, your best bet is probably to use the Kue JSON API to POST a job.
* We don't allow public access to this API for production YASP, but you could do it yourself on your own instance.

###How can I run my own YASP for myself/friends?
* You can run your own instance of YASP, and then add account_ids to the "permanent" list to make them immune to untracking.
