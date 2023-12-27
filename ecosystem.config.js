/**
 * PM2 configuration file
 */
require('dotenv').config();

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
  // Deployed separately
  // {
  //   name: 'fullhistory',
  //   group: 'backend',
  // },
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
  // {
  //   name: 'items',
  //   group: 'backend',
  // },
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
    name: 'archiver',
    group: 'backend',
  },
];

// If GROUP is set filter to only the matching group
arr = arr.filter(
  (app) => !process.env.GROUP || app.group === process.env.GROUP,
);

const apps = arr.map((app) => {
  const dev = process.env.NODE_ENV === 'development';
  // In production, we can use the built files directly
  // This makes the pm2 memory metrics work
  const prod = process.env.NODE_ENV === 'production';
  const prodScript = `build/svc/${app.name}.js`;
  const devScript = `svc/${app.name}.ts`;
  const script = prod ? prodScript : devScript;
  return {
    ...app,
    watch: dev ? true : false,
    ignore_watch: ['.git', 'node_modules', 'build', 'json'],
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
