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
    name: 'retriever',
    group: 'retriever',
  },
  {
    name: 'proxy',
    group: 'proxy',
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
    name: 'web',
    group: 'backend',
    exec_mode: prod ? 'cluster' : undefined,
    instances: prod ? os.cpus().length : undefined,
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
    name: 'backupscanner',
    group: 'disabled',
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
    group: 'disabled',
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
    script,
    interpreter:
      script.endsWith('.ts') || script.endsWith('.mts')
        ? 'node_modules/.bin/tsx'
        : undefined,
    env: {
      ROLE: app.name,
    },
  };
});

module.exports = {
  apps,
};
