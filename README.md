YASP - YASP: Another Stats Page
====

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
* KUE_USER (required, for http authentication on KUE UI)
* KUE_PASS (required, for http authentication on KUE UI)
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
* START_SEQ_NUM
