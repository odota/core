/**
 * Entry point for the application.
 * */
import cp from 'child_process';
import fs from 'fs';

if (process.env.PROVIDER === 'gce' && !fs.existsSync('/usr/src/.env')) {
  cp.execSync(
    'curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/.env',
  );
}

async function start() {
  if (process.env.ROLE) {
    // if role variable is set just run that script
    import('./svc/' + process.env.ROLE + '.js');
  } else if (process.env.GROUP) {
    // or run the group with pm2
    cp.execSync('pm2 start ecosystem.config.js');
    setInterval(
      () => {
        cp.execSync('pm2 flush');
      },
      60 * 60 * 1000,
    );
  } else {
    // Block indefinitely (keep process alive for Docker)
    process.stdin.resume();
  }
}
start();

process.on('uncaughtException', async (err) => {
  console.error(err);
  if (process.env.ROLE === 'web') {
    const { redisCount } = await import('./util/utility.js');
    redisCount(null, 'web_crash');
  }
  process.exit(1);
});
process.on('unhandledRejection', async (reason, p) => {
  // In production pm2 doesn't appear to auto restart unless we exit the process here
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  if (process.env.ROLE === 'web') {
    const { redisCount } = await import('./util/utility.js');
    redisCount(null, 'web_crash');
  }
  process.exit(1);
});
