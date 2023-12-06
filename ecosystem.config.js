const config = require('./config.js');

let arr = [
  {
    name: 'web',
    group: 'web',
  },
  {
    name: 'retriever',
    group: 'retriever',
  },
  {
    name: 'proxy',
    group: 'proxy',
  },
  {
    name: 'parser',
    group: 'parser',
  },
  {
    name: 'apiadmin',
    group: 'backend',
  },
  {
    name: 'mmr',
    group: 'backend',
  },
  {
    name: 'profiler',
    group: 'backend',
  },
  {
    name: 'scanner',
    group: 'backend',
  },
  {
    name: 'fullhistory',
    group: 'backend',
  },
  {
    name: 'autofullhistory',
    group: 'backend',
  },
  {
    name: 'monitor',
    group: 'backend',
  },
  {
    name: 'gcdata',
    group: 'backend',
  },
  {
    name: 'buildsets',
    group: 'backend',
  },
  {
    name: 'cosmetics',
    group: 'backend',
  },
  {
    name: 'distributions',
    group: 'backend',
  },
  {
    name: 'heroes',
    group: 'backend',
  },
  {
    name: 'herostats',
    group: 'backend',
  },
  {
    name: 'items',
    group: 'backend',
  },
  {
    name: 'leagues',
    group: 'backend',
  },
  {
    name: 'livegames',
    group: 'backend',
  },
  {
    name: 'proplayers',
    group: 'backend',
  },
  {
    name: 'teams',
    group: 'backend',
  },
  {
    name: 'scenarios',
    group: 'backend',
  },
  {
    name: 'scenariosCleanup',
    group: 'backend',
  },
  {
    name: 'counts',
    group: 'backend',
  },
  {
    name: 'syncSubs',
    group: 'backend',
  },
  {
    name: 'cassandraDelete',
    group: 'backend',
  },
];

// If GROUP is set filter to only the matching group
arr = arr.filter((app) => !config.GROUP || app.group === config.GROUP);

const apps = arr.map((app) => {
  const dev = config.NODE_ENV === 'development';
  const script = `svc/${app.name}.ts`;
  return {
    ...app,
    watch: dev ? true : false,
    ignore_watch: ['.git', 'node_modules', 'build'],
    exec_mode: 'fork',
    instances: 1,
    script,
    interpreter:
      script.endsWith('.ts') || script.endsWith('.mts')
        ? 'node_modules/.bin/tsx'
        : undefined,
  };
});

module.exports = {
  apps,
};
