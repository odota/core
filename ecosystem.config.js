const config = require('./config.js');

let arr = [
  {
    script: 'svc/web.ts',
    group: 'web',
  },
  {
    script: 'svc/retriever.ts',
    group: 'retriever',
  },
  {
    script: 'svc/proxy.ts',
    group: 'proxy',
  },
  {
    script: 'svc/parser.ts',
    group: 'parser',
  },
  {
    script: 'svc/apiadmin.ts',
    group: 'backend',
  },
  {
    script: 'svc/mmr.ts',
    group: 'backend',
  },
  {
    script: 'svc/profiler.ts',
    group: 'backend',
  },
  {
    script: 'svc/scanner.ts',
    group: 'backend',
  },
  {
    script: 'svc/fullhistory.ts',
    group: 'backend',
  },
  {
    script: 'svc/autofullhistory.ts',
    group: 'backend',
  },
  {
    script: 'svc/monitor.ts',
    group: 'backend',
  },
  {
    script: 'svc/gcdata.ts',
    group: 'backend',
  },
  {
    script: 'svc/buildsets.ts',
    group: 'backend',
  },
  {
    script: 'svc/cosmetics.ts',
    group: 'backend',
  },
  {
    script: 'svc/distributions.ts',
    group: 'backend',
  },
  {
    script: 'svc/heroes.ts',
    group: 'backend',
  },
  {
    script: 'svc/herostats.ts',
    group: 'backend',
  },
  {
    script: 'svc/items.ts',
    group: 'backend',
  },
  {
    script: 'svc/leagues.ts',
    group: 'backend',
  },
  {
    script: 'svc/livegames.ts',
    group: 'backend',
  },
  {
    script: 'svc/proplayers.ts',
    group: 'backend',
  },
  {
    script: 'svc/teams.ts',
    group: 'backend',
  },
  {
    script: 'svc/scenarios.ts',
    group: 'backend',
  },
  {
    script: 'svc/scenariosCleanup.ts',
    group: 'backend',
  },
  {
    script: 'svc/counts.ts',
    group: 'backend',
  },
  {
    script: 'svc/syncSubs.ts',
    group: 'backend',
  },
  {
    script: 'svc/cassandraDelete.ts',
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
      app.script.endsWith('.ts') || app.script.endsWith('.mts')
        ? 'node_modules/.bin/tsx'
        : undefined,
  };
});

module.exports = {
  apps,
};
