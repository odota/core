const { GROUP, NODE_ENV } = require('./config.js');

let arr = [
    {
        "name": "web",
        "script": "svc/web.mjs",
        "group": "web",
      },
      {
        "name": "retriever",
        "script": "svc/retriever.mjs",
        "group": "retriever",
      },
      {
        "name": "proxy",
        "script": "svc/proxy.mjs",
        "group": "proxy",
      },
      {
        "name": "parser",
        "script": "svc/parser.mjs",
      },
    {
      "name":  "apiadmin",
      "script": "svc/apiadmin.mjs",
      "group": "backend",
    },
    {
      "name": "mmr",
      "script": "svc/mmr.mjs",
      "group": "backend",
    },
    {
      "name": "profiler",
      "script": "svc/profiler.mjs",
      "group": "backend",
    },
    {
     "name": "scanner",
      "script": "svc/scanner.mjs",
      "group": "backend",
    },
    {
      "name": "fullhistory",
      "script": "svc/fullhistory.mjs",
      "group": "backend",
    },
    {
      "name": "fullhistory",
      "script": "svc/autofullhistory.mjs",
      "group": "backend",
    },
    {
      "name": "monitor",
      "script": "svc/monitor.mjs",
      "group": "backend",
    },
    {
      "name": "gcdata",
      "script": "svc/gcdata.mjs",
      "group": "backend",
    },
    {
      "name": "buildsets",
      "script": "svc/buildsets.mjs",
      "group": "backend",
    },
    {
      "name": "cosmetics",
      "script": "svc/cosmetics.mjs",
      "group": "backend",
    },
    {
      "name": "distributions",
      "script": "svc/distributions.mjs",
      "group": "backend",
    },
    {
      "name": "heroes",
      "script": "svc/heroes.mjs",
      "group": "backend",
    },
    {
      "name": "herostats",
      "script": "svc/herostats.mjs",
      "group": "backend",
    },
    {
      "name": "items",
      "script": "svc/items.mjs",
      "group": "backend",
    },
    {
      "name": "leagues",
      "script": "svc/leagues.mjs",
      "group": "backend",
    },
    {
      "name": "livegames",
      "script": "svc/livegames.mjs",
      "group": "backend",
    },
    {
      "name": "proplayers",
      "script": "svc/proplayers.mjs",
      "group": "backend",
    },
    {
      "name": "teams",
      "script": "svc/teams.mjs",
      "group": "backend",
    },
    {
      "name": "scenarios",
      "script": "svc/scenarios.mjs",
      "group": "backend",
    },
    {
      "name": "scenariosCleanup",
      "script": "svc/scenariosCleanup.mjs",
      "group": "backend",
    },
    {
      "name": "counts",
      "script": "svc/counts.mjs",
      "group": "backend",
    },
    {
      "name": "syncSubs",
      "script": "svc/syncSubs.mjs",
      "group": "backend",
    },
    {
      "name": "cassandraDelete",
      "script": "svc/cassandraDelete.mjs",
      "group": "backend",
    }
  ];

// If GROUP is set filter to only the matching group
arr = arr.filter(app => !GROUP || app.group === GROUP);

const apps = arr.map(app => {
    const dev = NODE_ENV === 'development';
    return {
        ...app,
        watch: dev ? true : false,
        ignore_watch: [".git", "node_modules"],
        exec_mode: 'fork',
        instances: 1,
    }
});

module.exports = {
  apps
};
  