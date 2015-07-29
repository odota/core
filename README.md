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
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
* Build `npm run build`
* Run all services in dev mode (this will run under nodemon so file changes automatically restart the server): `npm run dev`.  You can also start individual services.

Sample Data
----
* `wget https://github.com/yasp-dota/testfiles/blob/master/dota.zip && unzip dota && mongorestore --dir dota` to import a database dump that can be imported using mongorestore if a larger data set is desired.

Developer's Guide
----
* YASP is built using a microservice architecture, in order to promote modularity and allow different pieces to scale on different machines.
* Descriptions of each service:
    * web: This serves the web traffic.
    * retriever: This is a standalone HTTP server that accepts URL params `match_id` and `account_id`, and interfaces with the Steam GC in order to return match details/account profile.
        * Accessing it without any params returns a list of the registered Steam accounts, and a hash mapping friends of those accounts to the Steam account.
        * This is used in order to determine the list of users that have added a tracker as a friend.
    * worker: Takes care of background tasks.  Currently, this involves re-queueing currently active tasks on restart, and rebuilding the sets of tracked players, donated players, rating players, etc.
    * parser: This is a standalone HTTP server that accepts a URL param ```url```.  It expects a compressed replay file `.dem.bz2` at this location, which it downloads, streams through `bunzip2`, and then through the compiled parser.
        * The parser produces a stream of JSON objects to STDOUT, which the HTTP server returns to the client.
    * parseManager: This reads Redis to find the currently available list of parse workers.  A single endpoint may appear multiple times (as many cores as it has).
        * This uses the Node cluster module to fork as many workers as there are available parsing cores.
        * Each one processes parse jobs in Kue.
        * Processing a job entails:
            * Get the replay URL: `getReplayUrl` takes care of this.  It will refuse to get a URL if match.start_time is older than the replay expire time (7 days).
            * Send a request to a parse worker.
            * Read the resulting stream of JSON objects and combine into a monolithic JSON object for storage in DB, as `match.parsed_data`
            * The schema for the current parsed_data structure can be found in `utility.getParseSchema`.
    * scanner: Reads the Steam sequential API to find the latest matches.  If a match is found passing the criteria for parse.  `operations.insertMatch` is called.  If `match.parse_status` is explicitly set to 0, the match is queued for parse.
    * proxy: Simply proxies all requests to the Steam API.  The host is functionally equivalent to `api.steampowered.com`.
    * skill: Reads the GetMatchHistory API in order to continuously find matches of a particular skill level.
        * Applying the following filters increases the number of matches we can get skill data for;
            * `min_players=10`
            * `hero_id=X`
            * By permuting all three skill levels with the list of heroes, we can get up to 500 matches for each combination.
    * mmr: Processes MMR requests
    * fullhistory: Processes full history requests
* Pipeline: Generally parses come in one of two ways:
    * Sequential: We read a match from the Steam API that either has `leagueid>0` or contains a player in the `trackedPlayer` set.
    * Request: Requests are processed from the Request page via socket.io.  This reads the match data from the steam API, then uses `operations.insertMatchProgress` in order to force waiting for the parse to finish.
        * This allows the user to be updated of parse percentage.
        * Requests are set to only try once.
* Player/match caching: We cache matches in Redis in order to reduce DB lookups on repeated loads.
    * Player caching is more complicated.  It means that whenever we add a match or add parsed data to a match, we need to update all of that match's player caches to reflect the change (to keep the cache valid).
* A client side bundle of JS is built (and minified in production) using Webpack.  If you want to make changes to client side JS, you will want to run the watch script `npm run watch` in order to automatically rebuild after making changes.
* Tools recommended for developers on the command line: `sudo npm install -g mocha foreman nodemon`
    * `mocha` is used to run the tests.  Installing the command-line tool allows you greater control over which tests you want to run.
    * `foreman` is used to run services individually.  The executable name is `nf`.
    * `nodemon` watches the server files and restarts the server when changes are detected.
* Tests:  `npm test` to run the full test suite.
* Brief snippets and useful links are included in the [wiki](https://github.com/yasp-dota/yasp/wiki)
```
//constants are currently built pre-run and written to file
//web requires constants
//worker requires constants (fullhistory needs to iterate through heroes)
//parseManager requires constants (processparse needs to map combat log names to hero ids)
//buildSets currently built by worker, includes getRetriever, getParser, which are service discovery and could be separated from the actual set building
//scanner requires buildSets in order to avoid leaking players, retries until available
//parseManager requires getRetrievers to get replay url, retries until available
//parseManager requires getParsers, since we need to set concurrency before starting, retries until available
//retriever, parser, proxy are independent
```
History
----
* Project started in August 2014
* Originally forked from Rjacksonm1/matchurls, started in July 2013

Core Development
----
* howardc93
* albertcui
* nickhh
