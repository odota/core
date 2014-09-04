YASP - Yet Another (Dota) Stats Page
====

An attempt to provide awesome replay-parsed stats for free!  

Requires

* node.js v0.10
* MongoDB
* Java 1.7

Configuration

* Install node dependencies: `npm install`
* Start up your MongoDB
* Create a sentry and .env file
* Run `nf start`, which builds the parser and runs the app with environment variables (via Foreman)

Obtaining Replays
====
This application contains code from [matchurls](https://rjackson.me/tools/matchurls). It makes DOTA 2 API calls
to get your most recently played games and downloads the replays. The replays are sent to a parser
to get interesting stats. All of this is stored in a MongoDB database.

Match Parser
====
Powered by [clarity](https://github.com/skadistats/clarity), which does the actual parsing of replays.

TODO
====
* Get matches on page load, or poll?  How many matches to look back?
* parse asynchronously on match page load.  how to deal with attempted re-download overwriting files?
* don't have java write to db, output and have node handling db ops