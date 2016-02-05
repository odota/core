YASP (Yet Another Stats Page)
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Discord](https://img.shields.io/badge/Discord-join%20chat%20%E2%86%92-738bd7.svg?style=flat-square)](https://discord.gg/0o5SQGbXuWALMIGQ)

Overview
----

We provide free, open source replay parsing for the Dota 2 Community. This includes item timelines, gold/LH graphs, ward positions, and position heatmaps.

See [here](http://yasp.co/matches/1912366402) for an example of our match analysis.

Tech
----
* Web/Services: Node.js
* Storage: PostgreSQL/Redis/Cassandra
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart
----
* Install dependencies for Ubuntu (14.04 LTS, this is what we develop on and production uses): `sudo bash init.sh`. For other platforms, please have a look at the [wiki](https://github.com/yasp-dota/yasp/wiki/Installation-for-other-platforms).
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * Note: If you have Steam Guard activated on your account you will either have to deactivate it or (recommended) create a new account for use with the retriever.
* Set up the database `sudo npm run create`
* Build `npm run build`
* Run `npm test` to make sure your install works correctly
* Run all services in dev mode (this will run under nodemon so file changes automatically restart the server): `npm run dev`. You can also start individual services: `npm run dev web,parser`

Maintenance
----
* `node runner updateconstants` pulls latest constants data and saves to `json` directory
* `node runner fullhistory` queues a full history request for all players in DB who don't have it yet
* `npm run update` updates all deps to latest versions
* `npm run deploy` deploys application to Kubernetes cluster

Developer's Guide
----
See the [wiki](https://github.com/yasp-dota/yasp/wiki/Developer's-Guide).

History
----
* Project started in August 2014
* Forked from https://github.com/RJacksonm1/matchurls, created in July 2013
