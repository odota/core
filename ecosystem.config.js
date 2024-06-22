/**
 * PM2 configuration file
 */
require('dotenv').config();
const os = require('os');

const dev = process.env.NODE_ENV === 'development';
const prod = process.env.NODE_ENV === 'production';

let arr = [
  // Services in non-backend groups are deployed separately
  {
    name: 'proxy',
    group: 'proxy',
  },
  {
    name: 'web',
    group: 'backend',
    exec_mode: prod ? 'cluster' : undefined,
    instances: prod ? os.cpus().length : undefined,
  },
  {
    name: 'retriever',
    group: 'backend',
    env: {
      // Clear registry host since we don't need to register local service
      SERVICE_REGISTRY_HOST: '',
    },
  },
  {
    name: 'parser',
    group: 'backend',
  },
  {
    name: 'fullhistory',
    group: 'backend',
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
  // {
  //   name: 'scanner2',
  //   group: 'backend',
  //   env: {
  //     SCANNER_OFFSET: '50000',
  //   }
  // },
  {
    name: 'backupscanner',
    group: 'disabled',
  },
  {
    name: 'autocache',
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
    name: 'cleanup',
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
  // Requires the gcloud CLI to be installed
  // We could write this in JS to use the REST API, authenticating using metadata server credentials
  // {
  //   name: 'cycler',
  //   group: 'backend',
  //   script: 'scripts/cycler.py',
  //   interpreter: 'python3',
  // },
];

// If GROUP is set filter to only the matching group
arr = arr.filter(
  (app) => !process.env.GROUP || app.group === process.env.GROUP,
);

const apps = arr.map((app) => {
  // In production, we can use the built files directly
  // This makes the pm2 memory metrics work
  const prodScript = `build/index.js`;
  const devScript = `index.ts`;
  const script = prod ? prodScript : devScript;
  return {
    ...app,
    watch: dev ? true : false,
    ignore_watch: ['.git', 'node_modules', 'build', 'json'],
    log_date_format: 'YYYY-MM-DDTHH:mm:ss',
    exec_mode: app.exec_mode ?? 'fork',
    instances: app.instances ?? 1,
    script: app.script ?? script,
    interpreter:
      app.interpreter ??
      (script.endsWith('.ts') || script.endsWith('.mts')
        ? 'node_modules/.bin/tsx'
        : undefined),
    env: {
      ...app.env,
      ROLE: app.name,
    },
  };
});

module.exports = {
  apps,
};
