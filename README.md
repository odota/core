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
* Parses replays of Dota 2 matches to provide additional statistics.
* Runs as a Node.js/Express  web application.
* Designed to scale to thousands of users.
* Parser powered by [clarity](https://github.com/skadistats/clarity).  

Quickstart
====
* Install dependencies: `sudo bash init.sh`
* Create .env file with required config values in KEY=VALUE format (see config.js) `touch .env`
* Build `npm install && npm run build`
* Launch in dev mode: `npm run dev`

Sample Data
====
* Load the test players and matches: `mongo dota migrations/loader.js`

Lessons and Rules
====
* Never async.parallel database calls.
