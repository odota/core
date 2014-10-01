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
* Create .env file with desired parameters
* Run `nf start`

.env
====
* STEAM_USER
* STEAM_PASS
* STEAM_GUARD_CODE (can be empty)
* STEAM_API_KEY
* COOKIE_SECRET
* DELETE_REPLAYS
* MONGOHQ_URL
* AWS_S3_BUCKET
* AWS_ACCESS_KEY_ID
* AWS_SECRET_ACCESS_KEY
* PORT
* MATCH_SEQ_NUM
* PARSER_HOST

