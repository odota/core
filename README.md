YASP - YASP: Another Stats Page
====

An attempt to provide awesome replay-parsed stats for free!  

Requires

* node.js v0.10
* MongoDB
* Java 1.7

Configuration

* Install node dependencies: `npm install`
* Get Foreman `npm install -g foreman`
* Get MongoDB and start your db server `parts install mongodb maven;parts start mongodb`
* Create .env file with STEAM_USER, STEAM_PASSWORD, STEAM_API_KEY
* Run `nf start`, which builds the parser and runs the app with environment variables

Compiling the parser
====
Run `mvn -f parser/pom.xml package` to compile the parser.

Obtaining Replays
====
This application contains code from [matchurls](https://rjackson.me/tools/matchurls).  
It makes DOTA 2 API calls to get your most recently played games and downloads the replays.  
The replays are sent to a parser powered by [clarity](https://github.com/skadistats/clarity) to get interesting stats.  
Augmented match data is stored in MongoDB.

TODO
====
* Maintain list of users tracked (visiting a player page adds somebody)
* don't have java write to db, output and have node handling db ops
* Fix parsing trying to parse when replay isn't ready
* Fix match page breaking when replay hasn't been parsed (due to lack of player names)
* Make player names API request on page request, update/instert names
* Add tower/racks info
* Add hero position info
* Add rune info
* Add ward info
* Add chat log
* Add combat log
* match regions