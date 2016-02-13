YASP (Yet Another Stats Page)
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Join the chat at https://gitter.im/yasp-dota/yasp](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/yasp-dota/yasp?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Overview
----

* This project aims to provide free, open source, highly detailed match and player statistics for the Dota 2 community.
* Data comes from the WebAPI provided by Valve and fully automated parsing of match replays (.dem files).
* See [here](http://yasp.co/matches/1912366402) for an example of our match analysis (this match may not have the latest features as we're constantly adding new things).

Tech Stack
----
* Web/Microservices: Node.js
* Storage: PostgreSQL/Redis/Cassandra
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart
----
* We recommending using Cloud 9 IDE for fast and easy development, although you are free to develop on your own setup if you want.
* Create an account on Cloud 9: https://c9.io/dashboard.html
* Start a new workspace and choose the source GitHub repository as yasp-dota/yasp, or your own fork of it if you're planning to make changes and submit a pull request.
* Open the workspace
* Install dependencies: `sudo bash init.sh`. The script is designed for Ubuntu 14.04 LTS.  For other platforms, please have a look at the [wiki](https://github.com/yasp-dota/yasp/wiki/Installation-for-other-platforms).
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * The retriever requires a Steam account in order to fetch replay salts.  We recommend creating a new account use for this purpose (you won't be able to log into the account while the retriever is using it).  If you don't care about getting replay salts/downloading replays then you can skip this step.
* Set up the database `sudo npm run create`
* Build `npm run build`
* Run the application with one of the following: (this will run under nodemon so file changes automatically restart the server): 
  * `npm run dev` Run one instance of each service.
  * `npm run dev web` Runs just the web server.  Useful for developing just the frontend CSS/JS.
  * `npm run dev web,parser,requests,retriever` The minimal setup for being able to open the site in a browser and request parses by ID (which is a useful end-to-end test).
* Other useful commands
  * `npm run watch`: If you want to make changes to client side JS, you will want to run the watch script in a separate window in order to automatically rebuild after making changes.
  * `npm test` runs the full test suite.  Use `mocha` for more fine-grained control over the tests you want to run.
  * `node runner updateconstants` pulls latest constants data and saves to `json` directory
  * `node runner fullhistory` queues a full history request for all players in DB who don't have it yet
  * `npm run update` updates all deps to latest versions
* Get some starter data: You can request some parses to get some parsed data.  You can also log in through Steam on your own instance to trigger a full history request for that user (requires `fullhistory` service to be running)
* Make some changes and commit them: `git add --all; git commit -m "My first commit!"`
* Submit a pull request.  Wait for it to be reviewed and merged.
* Congratulations!  You're a contributor.

Architecture and Design
----
See the [wiki](https://github.com/yasp-dota/yasp/wiki/Architecture-and-Design).

History
----
* Project started in August 2014
* Forked from https://github.com/RJacksonm1/matchurls, created in July 2013
