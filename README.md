core
====
[![Discord](https://img.shields.io/badge/Discord-join%20chat%20%E2%86%92-738bd7.svg?style=flat-square)](https://discord.gg/0o5SQGbXuWCNDcaF)

Overview
----
* This project provides an open platform (backend) with Dota-related data (matches, players, etc.)
* Raw data comes from the WebAPI provided by Valve and fully automated parsing of match replays (.dem files).
* A public deployment of this code is maintained by The OpenDota Project.

Tech Stack
----
* Web/Microservices: Node.js
* Storage: PostgreSQL/Redis/Cassandra
* Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

Quickstart (Docker)
----
* Install Docker: `curl -sSL https://get.docker.com/ | sh`
* Clone the repo: `git clone https://github.com/odota/core`
* Go into the directory: `cd core`
* Start containers and initialize databases: `sudo bash scripts/dev.sh`
* Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  * `STEAM_API_KEY` You need this in order to access the Steam Web API.  
  * `STEAM_USER, STEAM_PASS` The retriever requires a Steam account in order to fetch replay salts. It is recommended to use a new account for this purpose (you won't be able to log into the account while the retriever is using it).  If you don't care about getting replay salts/downloading replays then you can skip this step.
* Get a terminal into the running container: `sudo docker exec -it yasp bash`
* Rebuild inside the container (your local directory hides the built files): `npm run build`
* Start the services you want to run:
  * `pm2 start profiles/basic.json` This starts all the basic services to be able to read the API and request parses (which is a useful end-to-end test).  The profiles directory contains common sets of services to be started together.
  * Useful PM2 commands:
    * `pm2 start svc/web.js --watch` This starts a specific service and watches it for changes.
    * `pm2 logs web` You can use this command to inspect the output of a service.
    * `pm2 delete all` Stop and remove all the services.
* Tests
  * `npm test` runs the full test suite.  Use `mocha` for more fine-grained control over the tests you want to run.
* Get some starter data
  * You can request some parses by ID to get some parsed data.
  * You can also run `scanner` to get some matches from the API.
* File changes you make outside the container should be automatically mirrored to the container.
* Make some changes and commit them: `git add --all; git commit -m "My first commit!"`
* Submit a pull request.  Wait for it to be reviewed and merged.
* Congratulations!  You're a contributor.

Docker Compose
----
* Alternatively, if you have Docker Compose [installed](https://docs.docker.com/compose/install/) you can just run `docker-compose up`.
 * Databases are set up and tables are created automatically.
 * By default, minimal configuration necessary to open the site in a browser and request parses by ID is started. This can be overridden via `docker-compose.override.yml`.
 * `sudo docker exec -it yasp_web_1 bash` will give you a terminal into the running web container.

Getting Help
----
* Feel free to open a new issue to ask questions/get help!
* You can also find us on Discord if you'd like real-time help.
* The following blog posts may help you understand the codebase/architecture:
  * General Learnings: https://odota.github.io/blog/2016/05/13/learnings/
  * Architecture: https://odota.github.io/blog/2016/05/15/architecture/
  * Deployment/Infrastructure: https://odota.github.io/blog/2016/08/10/deployment/

History
----
* Project started in August 2014
* Forked from https://github.com/RJacksonm1/matchurls
