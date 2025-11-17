/**
 * PM2 configuration file
 */
import 'dotenv/config';
import os from 'node:os';

const dev = process.env.NODE_ENV === 'development';
const prod = process.env.NODE_ENV === 'production';

let arr = [
  // Services in non-backend groups are deployed separately
  {
    // Proxy requests to Steam API
    name: 'proxy',
    group: 'proxy',
  },
  {
    name: 'autoprofiler',
    group: 'backend',
  },
  {
    name: 'autofullhistory',
    group: 'backend',
  },
  {
    name: 'autommr',
    group: 'backend',
  },
  // {
  //   name: 'autoreconcile',
  //   group: 'backend',
  // },
  // {
  //   // Alternative way of getting matches if GetMatchHistoryBySequenceNum is broken
  //   name: 'backupscanner',
  //   group: 'disabled',
  // },
  {
    name: 'web',
    group: 'backend',
    exec_mode: prod ? 'cluster' : undefined,
    instances: prod ? os.cpus().length : undefined,
  },
  // One local instance of retriever for getting player profiles since this isn't rate limited
  {
    name: 'retriever',
    group: 'backend',
    env: {
      // Clear registry host since we don't need to register local service
      SERVICE_REGISTRY_HOST: '',
    },
  },
  {
    // Requests and inserts replay parse data. Note this is different from parseServer which is in Java and runs externally
    name: 'parser',
    group: 'backend',
    env: {
      POSTGRES_MAX_CONNECTIONS: '50',
    },
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
    env: {
      // Use the local retriever instance
      USE_SERVICE_REGISTRY: '',
    },
  },
  {
    name: 'profiler',
    group: 'backend',
  },
  {
    name: 'scanner',
    group: 'backend',
    env: {
      POSTGRES_MAX_CONNECTIONS: '50',
    },
  },
  {
    // Secondary scanner that runs behind and picks up matches previously missing
    name: 'scanner2',
    name_override: 'scanner',
    group: 'backend',
    env: {
      SCANNER_OFFSET: '50000',
    },
  },
  // {
  //   name: 'cacher',
  //   group: 'backend',
  // },
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
    name: 'syncSubs',
    group: 'backend',
  },
  // {
  //   name: 'archiver',
  //   group: 'backend',
  // },
  {
    name: 'reconcile',
    group: 'backend',
  },
  {
    name: 'rater',
    group: 'backend',
  },
  // {
  //   name: 'repair',
  //   group: 'backend',
  // },
  {
    name: 'cycler',
    group: 'backend',
  },
];

// If GROUP is set filter to only the matching group
arr = arr.filter(
  (app) => !process.env.GROUP || app.group === process.env.GROUP,
);

export const apps = arr.map((app) => {
  const script = 'index.ts';
  return {
    ...app,
    watch: dev ? true : false,
    ignore_watch: ['.git', 'node_modules', 'build', 'json'],
    log_date_format: 'YYYY-MM-DDTHH:mm:ss',
    exec_mode: app.exec_mode ?? 'fork',
    instances: app.instances ?? 1,
    script: app.script ?? script,
    interpreter: 'node',
    env: {
      ...app.env,
      ROLE: app.name_override ?? app.name,
    },
  };
});
