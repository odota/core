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

We provide free, open source replay parsing for the Dota 2 Community. This includes item timelines, gold/LH graphs, ward positions, and position heatmaps.

See [here](http://yasp.co/matches/1912366402) for an example of our match analysis. For a full list of our features, see the [wiki](https://github.com/yasp-dota/yasp/wiki/Features).

Tech
----
* Web: Node.js/Express
* Storage: PostgreSQL/Redis
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart
----
* Install dependencies for Ubuntu: `sudo bash init.sh`. For other platforms, please have a look at the [wiki](https://github.com/yasp-dota/yasp/wiki/Installation-for-other-platforms).
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * Note: If you have Steam Guard activated on your account you will either have to deactivate it or create a new account for use with the retriever (recommended).
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
* Originally forked from Rjacksonm1/matchurls, started in July 2013

Core Development
----
* howardchung
* albertcui
* nickhh
