/**
 * Entry point for the application.
 * */
import cp from 'node:child_process';
import fs from 'node:fs';

if (!fs.existsSync('.env')) {
  if (process.env.PROVIDER === 'gce') {
    const resp = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/project/attributes/env',
      {
        headers: {
          'Metadata-Flavor': 'Google',
        },
      },
    );
    if (resp.ok) {
      fs.writeFileSync('.env', await resp.text());
    } else {
      throw new Error('failed to download config');
    }
  }
}

if (process.env.ROLE) {
  // if role variable is set just run that script
  import('./svc/' + process.env.ROLE + '.ts');
} else if (process.env.GROUP) {
  console.log('running group %s', process.env.GROUP);
  cp.execSync('pm2 start ecosystem.config.js');
  setInterval(
    () => {
      cp.execSync('pm2 flush');
    },
    24 * 60 * 60 * 1000,
  );
} else {
  console.log('blocking process indefinitely for Docker');
  process.stdin.resume();
}

process.on('uncaughtException', async (err) => {
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', async (reason, p) => {
  // In production pm2 doesn't appear to auto restart unless we exit the process here
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  process.exit(1);
});
