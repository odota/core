matchurls
=========

The little bit of code behind [matchurls](https://rjackson.me/tools/matchurls).  It is both an expressjs website and a Steam / Dota bot (via [node-steam](https://github.com/seishun/node-steam) and [node-dota2](https://github.com/RJacksonm1/node-dota2)), and uses MongoDB as a data store; a matchid is looked up in the database first, and if it is not present we send a request to the Dota 2 Game Coordinator, and then save the response to the database.


Requires

* node.js v0.10
* MongoDB


Configuration

* Install node dependencies: `npm install`
* Set up config: `vim config_SAMPLE.js`, `:w config.js`.
* Make empty sentry file: `touch sentry`
* Run once and have Steam yell at you for a Steam Guard code: `node app`
* Edit config with provide Steam Guard code
* Run again and bam, it works. Probably.
