YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Join the chat at https://gitter.im/yasp-dota/yasp](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/yasp-dota/yasp?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Features
----
* Replay Parsing: Parses replays of Dota 2 matches to provide in-depth statistics for matches.
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
  * Histograms (number of matches across Duration, LH, HD, TD, K, D, A, etc.)
  * Hero Matchups (win rate when playing as, with, against a hero)
  * Teammates/Opponents (win rate playing with/against particular players)
  * Max/N/Sum on multiple stat categories
  * Mean item build times
  * Skill accuracy
  * Records
  * Multikills/Kill Streaks
  * Laning
  * Ward Maps
  * Trends
  * Comparison against other users
  * Word Clouds (text said and read in all chat)
* Rating Tracker: Keep track of MMR by adding a Steam account as a friend
* Pro Games: Optionally parses professional matches: `leagueid>0`
* Modular: Microservice architecture, with pieces that can be used independently
* Scalable: Designed to scale to thousands of users.
* Free: No "premium" features.  All data is available for free to users.
* Open Source: All code is publicly available for feedback and contributions from the Dota 2 developer community.

Tech
----
* Web: Node.js/Express
* Storage: MongoDB/Redis
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart
----
* Install dependencies.  If on Debian/Ubuntu: `sudo bash init.sh`  Otherwise, you're responsible for figuring out how to install dependencies yourself.
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * Note: If you have 'Steam Guard' activated on your account you will
    either have to deactivate it or create a new account for use with
    the retriever, (recommended).
* Build `npm run build`
* Run all services in dev mode (this will run under nodemon so file changes automatically restart the server): `npm run dev`.  You can also start individual services.

Sample Data
----
* `wget https://github.com/yasp-dota/testfiles/raw/master/dota.zip && unzip dota && mongorestore --dir dota` to import a database dump if you want a medium-sized data set to work with.

Developer's Guide
----
* The project uses a microservice architecture, in order to promote modularity and allow different pieces to scale on different machines.
* Build step.  `npm run build` executes the following.
    * `npm install` Downloads and installs the Node dependencies from npm.
    * `npm run maven` Uses Maven to build the Java parser.
    * `npm run webpack` Builds and minifies the client side JS using Webpack.  
    * `npm run constants` Builds `constants.json` from `sources.json` by requesting some dynamic data from URLs.
        * web requires constants for display purposes (map internal strings to friendly names)
        * fullhistory requires constants (needs to iterate through heroes)
* Descriptions of each service:
    * `web`: An HTTP server which serves the web traffic.
        * All of the querying, filtering, aggregation, and caching happens here.
        * We use pm2 to be able to run multiple instances to serve our web traffic and reload the server when deploying new code (minimizes downtime due to rolling restart)
    * `retriever`: An HTTP server that accepts URL params `match_id` and `account_id`.
        * Interfaces with the Steam GC in order to return match details/account profile.
        * Accessing it without any params returns a list of the registered Steam accounts, and a hash mapping friends of those accounts to the Steam account.
        * This is used in order to determine the list of users that have added a tracker as a friend for MMR tracking.
    * `parser`: An HTTP server that accepts a URL param `url`.
        * It expects a compressed replay file `.dem.bz2` at this location, which it downloads, streams through `bunzip2`, and then through the compiled parser.
        * The parser emits a newline-delimited JSON stream of events, which is picked up and combined into a monolithic JSON object sent back to the client as the response.
        * The schema for the current parsed_data structure can be found in `utility.getParseSchema`.
    * `parseManager`: Processes parse requests.
        * Runs `buildSets` prior to start to ensure it has has the retrievers and parsers to begin parsing.
        * This starts a number of parse job processors based on the number of available parsers.
        * Processing a job:
            * `getReplayUrl` to get the download URL for a replay.  It selects randomly from the list of available retrievers to serve the request.
            * Send a request to a parse worker with the url.
            * Read the response from parse worker and save as `match.parsed_data`.
    * `worker`: Takes care of background tasks.  This is still a bit of a jack-of-all-trades since it used to process all job types before we moved some of them out to individual processes.
        * Processes incoming parse requests, using the `processApi` processor.
            * This could probably go in its own process.
        * Runs some functions on an interval.
            * `buildSets`.  Update sets of players based on Mongo/Redis state.
                * Rebuilds the sets of tracked players, donated players, and signed-in players by querying Mongo/Redis and saves them under keys in Redis.
                * It also creates Redis keys for parsers/retrievers by reading config. Could be extended later to query from a service discovery server.
            * `serviceDiscovery.getRetrievers`.  This iterates over the list of retrievers stored in Redis and queries them.
                * This includes the list of players who have a tracker as a friend, and the list of bots to offer to users.
                * In Redis, we store a mapping of the user's account ID to the retriever that hosts the tracker (since the MMR can only be fetched from that tracker).
            * Used to `updateNames`, which requested Steam personanames for 100 users on a timed interval.  We currently aren't updating names in the background.
            * Used to process API calls created by `updateNames`.
    * `scanner`: Reads the Steam sequential API to find the latest matches to add/parse.
        * Runs `buildSets` prior to start to ensure we have the latest trackedPlayers so we don't leak matches.
        * If a match is found passing the criteria for parse, `operations.insertMatch` is called.
        * If `match.parse_status` is explicitly set to 0, the match is queued for parse.
    * `proxy`: A standalone HTTP server that simply proxies all requests to the Steam API.
        * The host is functionally equivalent to `api.steampowered.com`.
    * `skill`: Reads the GetMatchHistory API in order to continuously find matches of a particular skill level.
        * Applying the following filters increases the number of matches we can get skill data for;
            * `min_players=10`
            * `hero_id=X`
            * By permuting all three skill levels with the list of heroes, we can get up to 500 matches for each combination.
    * `mmr`: Processes MMR requests.
        * Sends a request to the retriever hosting the user's tracker.
    * `fullhistory`: Processes full history requests.
        * By querying for a player's most recent 500 matches (API limit) with each hero, get most/all of a player's matches.
* Parses come in one of two ways:
    * Sequential: We read a match from the Steam API that either has `leagueid>0` or contains a player in the `trackedPlayer` set.
    * Request: Requests are processed from the Request page.  This reads the match data from the steam API, then uses `operations.insertMatchProgress` in order to force waiting for the parse to finish.
        * The client uses AJAX to poll the server.  When an error occurs or the job finishes, it either displays the error or redirects to the match page.
        * Requests are set to only try once.
* Player/match caching: 
    * We cache matches in Redis in order to reduce DB lookups on repeated loads.
    * Player caching is more complicated.  It means that whenever we add a match or add parsed data to a match, we need to update all of that match's player caches to reflect the change (to keep the cache valid).
* Tools recommended for developers on the command line: `sudo npm install -g mocha foreman nodemon`
    * `mocha` is used to run the tests.  Installing the command-line tool allows you greater control over which tests you want to run.
    * `foreman` is used to run services individually.  The executable name is `nf`.
    * `nodemon` watches the server files and restarts the server when changes are detected.
* `npm run watch`: If you want to make changes to client side JS, you will want to run the watch script in order to automatically rebuild after making changes.
* `npm test` to run the full test suite.
* Brief snippets and useful links are included in the [wiki](https://github.com/yasp-dota/yasp/wiki)



History
----
* Project started in August 2014
* Originally forked from Rjacksonm1/matchurls, started in July 2013

Core Development
----
* howardchung
* albertcui
* nickhh
