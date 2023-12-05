const config = require('./config.js');

let arr = [
  {
    script: 'svc/web.mts',
    group: 'web',
  },
  {
    script: 'svc/retriever.mts',
    group: 'retriever',
  },
  {
    script: 'svc/proxy.mts',
    group: 'proxy',
  },
  {
    script: 'svc/parser.mts',
    group: 'parser',
  },
  {
    script: 'svc/apiadmin.mts',
    group: 'backend',
  },
  {
    script: 'svc/mmr.mts',
    group: 'backend',
  },
  {
    script: 'svc/profiler.mts',
    group: 'backend',
  },
  {
    script: 'svc/scanner.mts',
    group: 'backend',
  },
  {
    script: 'svc/fullhistory.mts',
    group: 'backend',
  },
  {
    script: 'svc/autofullhistory.mts',
    group: 'backend',
  },
  {
    script: 'svc/monitor.mts',
    group: 'backend',
  },
  {
    script: 'svc/gcdata.mts',
    group: 'backend',
  },
  {
    script: 'svc/buildsets.mts',
    group: 'backend',
  },
  {
    script: 'svc/cosmetics.mts',
    group: 'backend',
  },
  {
    script: 'svc/distributions.mts',
    group: 'backend',
  },
  {
    script: 'svc/heroes.mts',
    group: 'backend',
  },
  {
    script: 'svc/herostats.mts',
    group: 'backend',
  },
  {
    script: 'svc/items.mts',
    group: 'backend',
  },
  {
    script: 'svc/leagues.mts',
    group: 'backend',
  },
  {
    script: 'svc/livegames.mts',
    group: 'backend',
  },
  {
    script: 'svc/proplayers.mts',
    group: 'backend',
  },
  {
    script: 'svc/teams.mts',
    group: 'backend',
  },
  {
    script: 'svc/scenarios.mts',
    group: 'backend',
  },
  {
    script: 'svc/scenariosCleanup.mts',
    group: 'backend',
  },
  {
    script: 'svc/counts.mts',
    group: 'backend',
  },
  {
    script: 'svc/syncSubs.mts',
    group: 'backend',
  },
  {
    script: 'svc/cassandraDelete.mts',
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
    ignore_watch: ['.git', 'node_modules', 'build'],
    exec_mode: 'fork',
    instances: 1,
    name: app.script.split('/').slice(-1)[0].split('.')[0],
    interpreter:
      app.script.endsWith('.mts') || app.script.endsWith('.ts')
        ? 'node_modules/.bin/tsx'
        : undefined,
  };
});

module.exports = {
  apps,
};
