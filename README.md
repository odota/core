YASP - YASP: Another Stats Page
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
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

Quickstart
====
* Create .env file, see `.env_example`
* Install node dependencies and build: `npm install && npm run build`
* Start YASP in dev mode (spawns a single retriever): `npm run dev`