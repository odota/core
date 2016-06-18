YASP (Yet Another Stats Page)
====
[![Build Status](https://travis-ci.org/yasp-dota/yasp.svg)](https://travis-ci.org/yasp-dota/yasp)
[![Code Climate](https://codeclimate.com/github/yasp-dota/yasp/badges/gpa.svg)](https://codeclimate.com/github/yasp-dota/yasp)
[![Coverage Status](https://coveralls.io/repos/yasp-dota/yasp/badge.svg)](https://coveralls.io/r/yasp-dota/yasp)
[![Dependency Status](https://david-dm.org/yasp-dota/yasp.svg)](https://david-dm.org/yasp-dota/yasp)
[![devDependency Status](https://david-dm.org/yasp-dota/yasp/dev-status.svg)](https://david-dm.org/yasp-dota/yasp#info=devDependencies)
[![Discord](https://img.shields.io/badge/Discord-join%20chat%20%E2%86%92-738bd7.svg?style=flat-square)](https://discord.gg/0o5SQGbXuWCNDcaF)

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

Quickstart (Docker)
----
* Install Docker: `curl -sSL https://get.docker.com/ | sh`
* Clone the repo: `git clone https://github.com/yasp-dota/yasp`
* Go into the directory: `cd yasp`
* Build the Docker container: `sudo docker build -t yasp/yasp .`
* Start a new container running the image, and map your local directory into the container: `sudo docker run -v $(pwd):/usr/src/yasp -di --name yasp --net=host yasp/yasp:latest`
* Start the external dependencies in separate containers.
  * `sudo docker run -d --name postgres --net=host postgres:9.5`
  * `sudo docker run -d --name redis --net=host redis:3`
  * (optional) `sudo docker run -d --name cassandra --net=host cassandra:3`
* Initialize Postgres: `sudo docker exec -i postgres psql -U postgres < sql/init.sql`
* Create tables: `sudo docker exec -i postgres psql -U postgres yasp < sql/create_tables.sql`
* Set up Cassandra (optional): `sudo docker exec -i cassandra cqlsh < sql/cassandra.cql`
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * `STEAM_API_KEY` You need this in order to access the Steam Web API.  
  * `STEAM_USER, STEAM_PASS` The retriever requires a Steam account in order to fetch replay salts.  We recommend creating a new account for this purpose (you won't be able to log into the account while the retriever is using it).  If you don't care about getting replay salts/downloading replays then you can skip this step.
* Get a terminal into the running container: `sudo docker exec -it yasp bash`
* Start the services you want to run:
  * `pm2 start profiles/basic.json` This starts all the basic services to be able to read the API and request parses (which is a useful end-to-end test).  Use `profiles/everything.json` to start everything.
  * Useful PM2 commands:
    * `pm2 start svc/web.js --watch` This starts a specific service and watches it for changes.
    * `pm2 logs web` You can use this command to inspect the output of a service.
    * `pm2 delete all` Stop and remove all the services.
* Useful commands
  * `npm test` runs the full test suite.  Use `mocha` for more fine-grained control over the tests you want to run.
  * `node tasks/updateconstants` pulls latest constants data and saves to `json` directory.
* Get some starter data
  * You can request some parses by ID to get some parsed data.  
  * You can also run `scanner` with `ENABLE_INSERT_ALL_MATCHES=1` in your `.env` to get some matches from the API.
* File changes you make outside the container should be automatically mirrored to the container.
* Make some changes and commit them: `git add --all; git commit -m "My first commit!"`
* Submit a pull request.  Wait for it to be reviewed and merged.
* Congratulations!  You're a contributor.

Docker Compose
----
* Alternatively, if you have Docker Compose [installed](https://docs.docker.com/compose/install/) you can just run `docker-compose up`.
 * 3 containers will be built and launched - one with postgres database, one with redis and one with web service.
 * Database is inited and tables are created automatically.
 * By default, minimal configuration necessairy to open the site in a browser and request parses by ID is started. This can be overridden via `docker-compose.override.yml`.
 * `sudo docker exec -it yasp_web_1 bash` will give you a terminal into the running web container.

Getting Help
----
* Feel free to open a new issue to ask questions/get help!
* You can also find us on Discord if you'd like real-time help.

Help Wanted
----
* UI/web design experts.  We want to improve the user interface and would appreciate any expertise you can contribute.  See https://github.com/yasp-dota/ui

History
----
* Project started in August 2014
* Forked from https://github.com/RJacksonm1/matchurls, created in July 2013
