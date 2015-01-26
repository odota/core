YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![npm version](https://badge.fury.io/js/yasp.svg)](http://badge.fury.io/js/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)

About
====
* Provides replay-parsed stats for free!  
* Parser powered by [clarity](https://github.com/skadistats/clarity).  

Dependencies
====
* Node.js
* Java 1.7
* Maven
* Redis
* MongoDB
* bzip2

Deployment
====
* Create .env file, see `.env_example`
* Get required submodules: `git submodule update --init`
* Install node dependencies: `npm install`
* Build: `npm run build`
* Start YASP: `npm start`

Retriever
====
* YASP requires a running retriever to fetch replay salts.
* Create retriever .env file, see `retriever/.env_example`
* Install its dependencies and start on a different port: `PORT=5100 cd retriever && npm install && npm start`

Tests
====
* Mocha tests: `npm test`
