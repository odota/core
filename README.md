YASP - YASP: Another Stats Page
====

* Live version at http://yasp.co
* Provides awesome replay-parsed stats for free!  
* Replay parsing powered by [clarity](https://github.com/skadistats/clarity).  
* Data stored in MongoDB.

Requirements
====
* node.js v0.10
* Java 1.7

Deployment
====
* Install node dependencies `npm install`
* Foreman `npm install -g foreman`
* Compile parser `mvn -f parser/pom.xml package`
* Create .env file with desired parameters
* Run `nf start`

.env
====
* STEAM_USER (required, a Steam username)
* STEAM_PASS (required, a Steam password)
* STEAM_GUARD_CODE (required, a Steam guard code, can be empty)
* STEAM_API_KEY (required, a Steam API key)
* SESSION_SECRET (required, a secret to use for sessions)
* DELETE_REPLAYS (optional, deletes replays after parse if set)
* MONGOHQ_URL (optional, default localhost/dota, the MongoDB to use)
* AWS_S3_BUCKET (optional, replays are saved to S3 bucket if set)
* AWS_ACCESS_KEY_ID (optional, allows use of S3)
* AWS_SECRET_ACCESS_KEY (optional, allows use of S3)
* SAVE_ALL_MATCHES (optional, saves all matches to db (not just tracked))
* SEAPORT_HOST
* SEAPORT_PORT
* NODE_ENV