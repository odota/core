# opendota-core

[![Help Contribute to Open Source](https://www.codetriage.com/odota/core/badges/users.svg)](https://www.codetriage.com/odota/core)

## Overview

- This project provides the [OpenDota API](https://docs.opendota.com/) for consumption.
- This API powers the [OpenDota UI](https://www.opendota.com), which is also an [open source project](https://github.com/odota/ui).
- Raw data comes from the WebAPI provided by Valve and fully automated parsing of match replays (.dem files).
- A public deployment of this code is maintained by The OpenDota Project.

## Tech Stack

- Microservices: Node.js
- Databases: PostgreSQL/Redis/Cassandra
- Parser: Java (powered by [clarity](https://github.com/skadistats/clarity))

## Quickstart (Docker)

- Install Docker: `curl -sSL https://get.docker.com/ | sh`. If you are on Windows, make sure you shared the working drive with Docker.
- Install Docker Compose: `curl -L "https://github.com/docker/compose/releases/download/1.17.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose`. If you are on Windows, docker-compose comes with the msi package.
- Create .env file with required config values in KEY=VALUE format (see config.js for a full listing of options) `cp .env_example .env`
  - `STEAM_API_KEY` You need this in order to access the Steam Web API, which is used to fetch basic match data and player profile data. You can use your main account to obtain the API key; it does not have to match the account used for the `STEAM_USER` and `STEAM_PASS` options. You can request an API key here: https://steamcommunity.com/dev/apikey
  - `STEAM_USER, STEAM_PASS` A Steam account login is required to fetch replay salts from the Dota GC (Game Coordinator). It is recommended to use an alt account for this purpose (you won't be able to log in from your own Steam client at the same time, and the account must not have Steam Guard enabled). This is not required if you don't need to parse replays.
- Start containers and initialize databases: `docker-compose up`
- Make some changes and commit them.
- Submit a pull request. Wait for it to be reviewed and merged.
- **OPTIONAL** Add your DOTA friend code (SteamId3) to the `CONTRIBUTORS.ts` file.
- Congratulations! You're a contributor.

## Notes

- The API runs on port 5000 by default.
- File changes made in the host directory get mirrored into the container and changes automatically trigger restarts if `NODE_ENV=development`
- Get a terminal into the running container: `docker exec -it odota-core bash`
- The process manager `pm2` is used to manage the individual services. Each is run as a separate Node.js process. By default, only the web service is launched.
  - `pm2 list` See the currently running services.
  - `pm2 start ecosystem.config.js` Start all the services
  - `pm2 start ecosystem.config.js --only web` Starts a specific service
  - `pm2 stop web` Stop a specific service
  - `pm2 stop all` Stop all the services
  - `pm2 logs web` Inspect the output of a service
  - `pm2 kill` Stop pm2 and all the processes if things are stuck
- `docker system prune` Cleans your system of any stopped containers, images, and volumes
- `docker-compose build` Rebuilds your containers (e.g. for database schema updates)
- `docker pull odota/parser` You may need to do this if the Java parse server has updated. Remove and recreate the parser container to run the latest code.
- `npm test` runs the test suite using the Node.js test runner
- Starter data
  - You can request a parse by ID to get a match with parsed data, e.g. `npm run request`
    - To complete a parse the following services need to be running: `pm2 start ecosystem.config.js --only web,retriever,parser,gcdata`
  - Or request a match history refresh on a player to get up to 500 of their recent matches, e.g. `npm run fullhistory`
    - This requires the fullhistory service: `pm2 start ecosystem.config.js --only fullhistory`

## Resources

- Join us on Discord (https://discord.gg/opendota)! We're always happy to help and answer questions.
- The following blog posts may help you understand the codebase/architecture:
  - General Learnings: https://odota.github.io/blog/2016/05/13/learnings/
  - Architecture: https://odota.github.io/blog/2016/05/15/architecture/
  - Deployment/Infrastructure: https://odota.github.io/blog/2016/08/10/deployment/

## History

- Project started in August 2014 by Howard Chung and Albert Cui
- Based on https://github.com/RJacksonm1/matchurls
