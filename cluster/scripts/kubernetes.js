var cp = require('child_process');
var services = require('../../deploy.json');
var apps = services.apps;
apps.forEach(function(app) {
    if (app.role === "core") {
        var name = app.script.split('.')[0];
        console.log('deploying %s', name);
        //cp.execSync("kubectl rolling-update " + name + " --image yasp/yasp:latest");
    }
});