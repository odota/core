/* eslint-disable global-require,import/no-dynamic-require */
/**
 * Entry point for the application.
 * */
const cp = require('child_process');
const pm2 = require('pm2');
const async = require('async');
const { apps } = require('./manifest.json');

const args = process.argv.slice(2);
const group = args[0] || process.env.GROUP;

if (process.env.PROVIDER === 'gce') {
  cp.execSync('curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/.env');
}
if (process.env.ROLE) {
  // if role variable is set just run that script
  require(`./svc/${process.env.ROLE}.js`);
} else if (group) {
  pm2.connect(() => {
    async.each(apps, (app, cb) => {
      if (group === app.group) {
        console.log(app.script, app.instances);
        pm2.start(app.script, {
          instances: app.instances,
          restartDelay: 10000,
        }, (err) => {
          if (err) {
            // Log the error and continue
            console.error(err);
          }
          cb();
        });
      }
    }, (err) => {
      if (err) {
        console.error(err);
      }
      pm2.disconnect();
    });
  });
  // Clean up the logs once a day
  setInterval(() => pm2.flush(), 86400 * 1000);
} else {
  // Block indefinitely (keep process alive for Docker)
  process.stdin.resume();
}
