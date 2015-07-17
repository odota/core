YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Join the chat at https://gitter.im/yasp-dota/yasp](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/yasp-dota/yasp?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Stories in Ready](https://badge.waffle.io/yasp-dota/yasp.svg?label=ready&title=Ready)](http://waffle.io/yasp-dota/yasp)

Features
----
* Replay Parsing: Parses replays of Dota 2 matches to provide additional statistics per match.
  * Item build times
  * Pick order
  * Number of pings
  * Stun/disable time
  * Consumables bought
  * Runes picked up
  * Laning position heatmap
  * Ward placement map
  * LHs per min table
  * Radiant advantage/Gold/XP/LH graphs per min
  * Teamfight summary
  * Objective times
  * Largest hit on a hero
  * Ability uses/hits
  * Item uses
  * Gold/XP breakdown
  * Damage/Kills crosstables
  * Multikills/Kill streaks
  * All chat
* Advanced Querying: Supports flexible querying and aggregation with the following criteria:
  * Player(s) in game (account ID)
  * Team composition (heroes)
  * Opponent composition (heroes)
  * Standard filters: patch, game mode, hero, etc.
* Aggregations:
  * Result count, win rate
  * Win rate by hour/day of week
  * Histogram (number of matches across Duration, LH, HD, TD, K, D, A, etc.)
  * Hero Matchups (win rate when playing as, with, against a hero)
  * Teammates/Opponents (win rate playing with/against particular players)
  * Max/N/Sum on multiple stat categories
  * Mean item build times
  * Skill accuracy
  * Laning
  * Ward maps
  * Word clouds (text said and read in all chat)
* Pro Games: See the latest professional matches (automatically parsed)
* Live matches: (Under construction)
* Comparison Tool: Compare players to each other and compute a percentile against all YASP users
* Rating Tracker: Keep track of MMR by adding a Steam account as a friend
* Modular: YASP is built with a microservice architecture, with pieces that can be reused in other projects
* Scalable: Designed to scale to thousands of users.
* Free: YASP puts no features behind paywalls.  All data is available for free to users.
* Open Source: YASP encourages contributions from the Dota 2 developer community.

Tech
----
* Web: Node.js/Express
* Storage: MongoDB/Redis
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Starting YASP
----
* Install dependencies.  If on Debian/Ubuntu: `sudo bash init.sh`  Otherwise, you're responsible for figuring out how to install dependencies yourself.
* Create .env file with required config values in KEY=VALUE format (see config.js) `touch .env`
* Build `npm run build`
* Launch in dev mode (this will run under nodemon so file changes automatically restart YASP): `npm run dev`.  Alternatively launch in regular mode: `npm start`
* Tools recommended for developers on the command line: `sudo npm install -g mocha foreman`
* The full list of services can be found in the Procfile.  You can run individual microservices using Foreman: `nf start {process name}`.  However, they will all try to start on port 5000 when run individually, so you may need to pass the `-p` argument to set the port explicitly.
* Developers: If you want to make changes to client side JS, you will want to run the watch script `npm run watch` in order to automatically rebuild after making changes.
* Tests: Tests are run with the Mocha framework.  `npm test` to run the full test suite.

Sample Data
----
* Load the test players and matches: `mongo dota migrations/loader.js`
* https://github.com/yasp-dota/testfiles/blob/master/dota.zip contains a database dump that can be imported using mongorestore if a larger data set is desired.

History
----
* Project started in August 2014
* Originally forked from Rjacksonm1/matchurls, started in July 2013

Core Development
----
* howardc93
* albertcui
* nickhh

Contributors
----
* mvthen
* McHearty
* coreymaher
* Aehrraid
