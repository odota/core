YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Join the chat at https://gitter.im/yasp-dota/yasp](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/yasp-dota/yasp?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

About
====
* Open source Dota 2 analytics platform.
* Advanced Querying: Supports flexible querying of matches by teammate, team composition, opponent composition, etc.
* Replay Parsing: Parses replays of Dota 2 matches to provide additional statistics, including item build times and ward placement.
* Visualizations: Data is rendered into bar charts, histograms, heatmaps, and more.
* Modular construction: You may find certain parts of YASP to be useful for your own needs.
* Runs as a Node.js/Express web application.
* Designed to scale to thousands of users.
* Parser powered by [clarity](https://github.com/skadistats/clarity).  

Quickstart
====
* Development mode: Runs yasp-core, parser, retriever on one machine
* Install dependencies: `sudo bash init.sh`
* Create .env file with required config values in KEY=VALUE format (see config.js null values) `touch .env`
* Build `npm run build`
* Launch in dev mode: `npm run dev`

Sample Data
====
* Load the test players and matches: `mongo dota migrations/loader.js`

I want to programmatically get replays!  
====
* You can fire up the retriever (supplying your own Steam credentials) and basically get a REST API for retrieving replay salts.  
* If you have friends on that account you could extract their MMR as well.

I want to parse my own replays!  
====
* You'll probably need to download the replays and run them through the parser (it uses stdin/stdout streams).
* This just emits a raw event log of JSON objects.  You'll have to figure out what you want to do with that data.
* In YASP, we aggregate that data into a single JSON object and store it in MongoDB, then display it nicely with our Jade templates.

I want to run my own YASP!
====
* You can run your own instance of YASP, and then add your account_id to the "permanent" list to keep yourself tracked.

Lessons and Rules
====
* Never async.parallel database calls.
