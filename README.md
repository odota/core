YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)  

* Provides replay-parsed stats for free!  
* Replay parsing powered by [clarity](https://github.com/skadistats/clarity).  

Dependencies
====
* Node.js
* Java 1.7
* Maven
* Redis
* MongoDB

Deployment
====
* Create .env file with desired parameters
* Install node dependencies: `npm install`
* Compile parser: `mvn -f parser/pom.xml package`
* Run: `npm start`

.env
====
* STEAM_API_KEY (required, a Steam API key)
* SESSION_SECRET (required, a secret to use for sessions)
* ROOT_URL (required, root URL of instance for oauth callbacks)
* RETRIEVER_HOST (required, a comma-separated list of hosts to send match replay url requests to)

* KUE_USER (optional, for http authentication on KUE UI)
* KUE_PASS (optional, for http authentication on KUE UI)
* DELETE_REPLAYS (optional, deletes replays after parse if set)
* MONGOHQ_URL (optional, default localhost/dota, the MongoDB to use)
* AWS_S3_BUCKET (optional, replays are saved to S3 bucket if set)
* AWS_ACCESS_KEY_ID (optional, allows use of S3)
* AWS_SECRET_ACCESS_KEY (optional, allows use of S3)
* NODE_ENV (optional, set to "production" for express optimizations and suppressed error messages)
* REDIS_PORT (optional, default 16379, port for Redis instance)
* REDIS_HOST (optional, default localhost, host for Redis instance)
* START_SEQ_NUM (optional, default highest value in db, starting sequence number for scan)
* RECAPTCHA_PUBLIC_KEY
* RECAPTCHA_SECRET_KEY
* UNTRACK_INTERVAL_DAYS
* PORT