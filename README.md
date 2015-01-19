YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/YASP.svg)](https://travis-ci.org/yasp-dota/YASP)  

* Live version at http://yasp.co
* Provides awesome replay-parsed stats for free!  
* Replay parsing powered by [clarity](https://github.com/skadistats/clarity).  
* Data stored in MongoDB.

Requirements
====
* node.js v0.10
* Java 1.7
* Maven
* Redis
* MongoDB

Deployment
====
* Install MongoDB/Redis/Maven/Java (or use remote provider)
* Install node dependencies `npm install`
* Foreman `npm install -g foreman`
* Compile parser `mvn -f parser/pom.xml package`
* Create .env file with desired parameters
* Run `nf start`

.env
====
* STEAM_API_KEY (required, a Steam API key)
* SESSION_SECRET (required, a secret to use for sessions)
* KUE_USER (required, for http authentication on KUE UI)
* KUE_PASS (required, for http authentication on KUE UI)
* KUE_PORT (optional, defaults to 5001)
* DELETE_REPLAYS (optional, deletes replays after parse if set)
* MONGOHQ_URL (optional, default localhost/dota, the MongoDB to use)
* AWS_S3_BUCKET (optional, replays are saved to S3 bucket if set)
* AWS_ACCESS_KEY_ID (optional, allows use of S3)
* AWS_SECRET_ACCESS_KEY (optional, allows use of S3)
* NODE_ENV (optional, when set to "production" causes express optimizations and suppressed error messages)
* ROOT_URL (required, root URL of instance for oauth callbacks)
* REDIS_PORT (optional, defaults to 16379, port for Redis instance)
* REDIS_HOST (optional, defaults to localhost, host for Redis instance)
* RETRIEVER_HOST (required, a host to send match replay url requests to)
