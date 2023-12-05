const config = require('./config.js');

let arr = [
  {
    script: 'svc/web.mjs',
    group: 'web',
  },
  {
    script: 'svc/retriever.mjs',
    group: 'retriever',
  },
  {
    script: 'svc/proxy.mjs',
    group: 'proxy',
  },
  {
    script: 'svc/parser.mjs',
    group: 'parser',
  },
  {
    script: 'svc/apiadmin.mjs',
    group: 'backend',
  },
  {
    script: 'svc/mmr.mjs',
    group: 'backend',
  },
  {
    script: 'svc/profiler.mjs',
    group: 'backend',
  },
  {
    script: 'svc/scanner.mjs',
    group: 'backend',
  },
  {
    script: 'svc/fullhistory.mjs',
    group: 'backend',
  },
  {
    script: 'svc/autofullhistory.mjs',
    group: 'backend',
  },
  {
    script: 'svc/monitor.mjs',
    group: 'backend',
  },
  {
    script: 'svc/gcdata.mts',
    group: 'backend',
  },
  {
    script: 'svc/buildsets.mjs',
    group: 'backend',
  },
  {
    script: 'svc/cosmetics.mjs',
    group: 'backend',
  },
  {
    script: 'svc/distributions.mjs',
    group: 'backend',
  },
  {
    script: 'svc/heroes.mjs',
    group: 'backend',
  },
  {
    script: 'svc/herostats.mjs',
    group: 'backend',
  },
  {
    script: 'svc/items.mjs',
    group: 'backend',
  },
  {
    script: 'svc/leagues.mjs',
    group: 'backend',
  },
  {
    script: 'svc/livegames.mjs',
    group: 'backend',
  },
  {
    script: 'svc/proplayers.mjs',
    group: 'backend',
  },
  {
    script: 'svc/teams.mjs',
    group: 'backend',
  },
  {
    script: 'svc/scenarios.mjs',
    group: 'backend',
  },
  {
    script: 'svc/scenariosCleanup.mjs',
    group: 'backend',
  },
  {
    script: 'svc/counts.mjs',
    group: 'backend',
  },
  {
    script: 'svc/syncSubs.mjs',
    group: 'backend',
  },
  {
    script: 'svc/cassandraDelete.mjs',
    group: 'backend',
  },
];

// If GROUP is set filter to only the matching group
arr = arr.filter((app) => !config.GROUP || app.group === config.GROUP);

const apps = arr.map((app) => {
  const dev = config.NODE_ENV === 'development';
  return {
    ...app,
    watch: dev ? true : false,
    ignore_watch: ['.git', 'node_modules'],
    exec_mode: 'fork',
    instances: 1,
    name: app.script.split('/').slice(-1)[0].split('.')[0],
    interpreter: (app.script.endsWith('.mts') || app.script.endsWith('.ts')) ? 'node_modules/.bin/tsx' : undefined,
  };
});

module.exports = {
  apps,
};
