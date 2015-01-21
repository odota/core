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
* Create .env file, see `.env_example`
* Install node dependencies: `npm install`
* Build parser: `npm run buildparser`
* Start: `npm start`