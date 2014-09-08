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
* Get MongoDB/Maven and start your db server `parts install mongodb maven;parts start mongodb`
* Create .env file with STEAM_USER, STEAM_PASSWORD, STEAM_API_KEY
* Run `mvn -f parser/pom.xml package` to compile the parser
* Run `nf start`, which runs the app with environment variables

Obtaining Replays
====
This application contains code from [matchurls](https://rjackson.me/tools/matchurls).  
It makes DOTA 2 API calls to get your most recently played games and downloads the replays.  
The replays are sent to a parser powered by [clarity](https://github.com/skadistats/clarity) to get interesting stats.  
Augmented match data is stored in MongoDB.

TODO
====
* Add mechanism for adding players to db
* Make match pages link to player page
* Make player names API request on page request, update/insert names
* Add tower/racks info
* Add hero position info
* Add rune info
* Add ward info
* Add chat log
* Add combat log