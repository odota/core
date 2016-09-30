/**
 * Entry point for the application.
 **/
const args = process.argv.slice(2);
const group = args[0] || process.env.GROUP;
const cp = require('child_process');
if (process.env.PROVIDER === 'gce') {
  cp.execSync('curl -H "Metadata-Flavor: Google" -L http://metadata.google.internal/computeMetadata/v1/project/attributes/env > /usr/src/.env');
}
if (process.env.ROLE) {
  // if role variable is set just run that script
  require('./svc/' + process.env.ROLE + '.js');
} else if (group) {
  const pm2 = require('pm2');
  const async = require('async');
  const manifest = require('./profiles/full.json').apps;
  pm2.connect(() => {
    async.each(manifest, (app, cb) => {
      if (group === app.group) {
        console.log(app.script, app.instances);
        pm2.start(app.script, {
          instances: app.instances,
        }, cb);
      }
    }, (err) => {
      if (err) {
        console.error(err);
      }
      pm2.disconnect();
    });
  });
} else {
  process.stdin.resume();
}
