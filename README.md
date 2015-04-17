YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Join the chat at https://gitter.im/yasp-dota/yasp](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/yasp-dota/yasp?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

* [About](https://github.com/yasp-dota/yasp/blob/master/_posts/about.md)

Quickstart
----
* Development mode: Runs yasp-core, parser, retriever on one machine
* Install dependencies: `sudo bash init.sh`
* Create .env file with required config values in KEY=VALUE format (see config.js null values) `touch .env`
* Build `npm run build`
* Launch in dev mode: `npm run dev`

Sample Data
----
* Load the test players and matches: `mongo dota migrations/loader.js`

Lessons and Rules
----
* Never async.parallel database calls.

Developer Questions
----
###How do I programmatically get replays?
* You can fire up the retriever (supplying your own Steam credentials) and basically get a REST API for retrieving replay salts.  
* If you have friends on that account you could extract their MMR as well.

###How do I use the parser?
* You'll probably need to download the replays and pipe them through the parser (it uses stdin/stdout streams, so standard shell redirection will work).
* This just emits a raw event log of JSON objects.  You'll have to figure out what you want to do with that data.
* In YASP, we aggregate that data into a single JSON object and store it in MongoDB, then display it nicely with our Jade templates.

###I've got a bunch of replay files.  Can I get them into YASP?
* If you want to run a replay file through the YASP pipeline, your best bet is probably to use the Kue JSON API to POST a job.
* We don't allow public access to this API for production YASP, but you could do it yourself on your own instance.

###How can I run my own YASP for myself/friends?
* You can run your own instance of YASP, and then add account_ids to the "permanent" list to make them immune to untracking.
