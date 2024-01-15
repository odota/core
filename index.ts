/**
 * Entry point for the application.
 * */
import axios from 'axios';
import cp from 'child_process';
import fs from 'fs';

async function start() {
  if (process.env.PROVIDER === 'gce' && !fs.existsSync('/usr/src/.env')) {
    const resp = await axios.get('http://metadata.google.internal/computeMetadata/v1/project/attributes/env', {
      headers: {
        'Metadata-Flavor': 'Google',
      },
      responseType: 'arraybuffer',
    });
    fs.writeFileSync('/usr/src/.env', resp.data);
  }
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
      24 * 60 * 60 * 1000,
    );
  } else {
    // Block indefinitely (keep process alive for Docker)
    process.stdin.resume();
  }
}
start();

process.on('uncaughtException', async (err) => {
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', async (reason, p) => {
  // In production pm2 doesn't appear to auto restart unless we exit the process here
  console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  process.exit(1);
});
