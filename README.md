YASP - YASP: Another Stats Page
====

An attempt to provide awesome replay-parsed stats for free!  

Requirements
====
* node.js v0.10
* Java 1.7

Deployment
====
* Install node dependencies: `npm install`
* Compile the parser `mvn -f parser package`
* Foreman `npm install -g foreman`
* Create .env file with STEAM_USER, STEAM_PASS, STEAM_API_KEY
* Add MONGOHQ_URL to env if using remote MongoDB, otherwise set up local mongodb server
* Add Amazon information if you'd like to store replays in S3
* Run `nf start`

Actions
====
This application contains code from [matchurls](https://rjackson.me/tools/matchurls).  
It makes DOTA 2 API calls to get your most recently played games and downloads the replays.  
The replays are sent to a parser powered by [clarity](https://github.com/skadistats/clarity) to get interesting stats.
Data is stored in MongoDB