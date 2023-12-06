/**
 * Entry point for the application.
 * */
import cp from 'child_process';
if (process.env.PROVIDER === 'gce') {
  cp.execSync(
    'curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/.env'
  );
}
async function start() {
  if (process.env.ROLE) {
    // if role variable is set just run that script
    import('./svc/' + process.env.ROLE + '.ts');
  } else if (process.env.GROUP) {
    // or run the group with pm2
    cp.execSync('pm2 start ecosystem.config.js');
    setInterval(
      () => {
        cp.execSync('pm2 flush all');
      },
      60 * 60 * 1000
    );
  } else {
    // Block indefinitely (keep process alive for Docker)
    process.stdin.resume();
  }
}
start();
