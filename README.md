YASP

This is a fork of [matchurls](https://rjackson.me/tools/matchurls). It makes DOTA 2 API calls
to get your most recently played games and downloads the replays. The replays are sent to a parser
to get interesting stats. All of this is stored in a MongoDB database.

Requires

* node.js v0.10
* MongoDB

Configuration

* Install node dependencies: `npm install`
* Set up config: `vim config_example.js`, `:w config.js`.
* Run once and have Steam yell at you for a Steam Guard code: `node app`
* Edit config with provide Steam Guard code
* Run again and bam, it works. Probably.