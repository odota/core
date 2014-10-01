YASP - YASP: Another Stats Page
====

Live version at http://yasp.albertcui.com  
Provides awesome replay-parsed stats for free!  
Replay parsing powered by [clarity](https://github.com/skadistats/clarity).  
Data stored in MongoDB.

Requirements
====
* node.js v0.10
* Java 1.7

Deployment
====
* Install node dependencies: `npm install`
* Compile the parser `mvn -f parser package`
* Foreman `npm install -g foreman`
* Create .env file with STEAM_USER, STEAM_PASS, STEAM_GUARD_CODE (can be empty), STEAM_API_KEY, COOKIE_SECRET
* Add MONGOHQ_URL to env if using remote MongoDB, otherwise set up local mongodb server
* Add Amazon information if storing replays in S3
* Run `nf start`
