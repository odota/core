core
====

Overview
----
* This project provides the [OpenDota API](https://docs.opendota.com/) for consumption.
* This API powers the [OpenDota UI](https://www.opendota.com)
* Raw data comes from the WebAPI provided by Valve and fully automated parsing of match replays (.dem files).
* A public deployment of this code is maintained by The OpenDota Project.

Tech Stack
----
* Microservices: Node.js
* Databases: PostgreSQL/Redis/Cassandra
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart (Docker)
----
* Install Docker: `curl -sSL https://get.docker.com/ | sh`. If you are on Windows, make sure you shared the working drive with Docker.
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * `STEAM_API_KEY` You need this in order to access the Steam Web API, which is used to fetch basic match data, player profile data, and cosmetic item data. You can use your main account to obtain the API key; it does not have to match the account used for the `STEAM_USER` and `STEAM_PASS` options.
  * `STEAM_USER, STEAM_PASS` A Steam account is required to fetch replay salts. It is recommended to use a new account for this purpose (you won't be able to use the account on two different hosts at the same time, and the account must not have SteamGuard). This is not required if you don't need to download/parse replays.
* Start containers and initialize databases: `docker-compose up`
* Make some changes and commit them.
* Submit a pull request.  Wait for it to be reviewed and merged.
* Congratulations!  You're a contributor.

Notes
----
* The API runs on port 5000 by default.
* File changes made in the host directory get mirrored into the container.
* Get a terminal into the running container: `docker exec -it odota-core bash`
* The process manager `pm2` is used to manage the individual services. Each is run as a single Node.js process. Services get restarted when file changes are detected (watch mode).
  * `pm2 list` See the currently running services.
  * `pm2 start manifest.json` Start all the services.
  * `pm2 start svc/web.js --watch` This starts a specific service and enables watch mode on it.
  * `pm2 logs web` Inspect the output of a service.
  * `pm2 delete all` Stop and remove all the services.
* Tests are written using the `mocha` framework.
  * `npm test` runs the full test suite.
  * Use `mocha` CLI for more fine-grained control over the tests you want to run.
* Starter data
  * You can request some parses by ID to get some parsed data.
  * You can also run `scanner` to get some matches from the API.

Resources
----
* Join us on Discord (https://discord.gg/0o5SQGbXuWCNDcaF)! We're always happy to help and answer questions.
* The following blog posts may help you understand the codebase/architecture:
  * Architecture: https://odota.github.io/blog/2016/05/15/architecture/
  * Deployment/Infrastructure: https://odota.github.io/blog/2016/08/10/deployment/
  * General Learnings: https://odota.github.io/blog/2016/05/13/learnings/

History
----
* Project started in August 2014
* Forked from https://github.com/RJacksonm1/matchurls
