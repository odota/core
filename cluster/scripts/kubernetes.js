var cp = require('child_process');
var services = require('../../deploy.json');
var apps = services.apps;
var kubeBin = (process.env.TRAVIS_BUILD_DIR || ".") + "/test/testfiles/kubectl";
console.log(kubeBin);
apps.forEach(function(app)
{
    if (app.role === "core")
    {
        var name = app.script.split('.')[0];
        console.log('deploying %s', name);
        //var command = [kubeBin, "rolling-update", name, "--image=yasp/yasp:latest", "--insecure-skip-tls-verify=true", "--username=" + process.env.KUBERNETES_USERNAME, +"--password=" + process.env.KUBERNETES_PASSWORD, "--server=" + "https://" + process.env.KUBERNETES_HOST + ":443"];
        var command = [kubeBin, "rolling-update", name, "--image=yasp/yasp:latest", "--namespace=yasp", "--insecure-skip-tls-verify=" + Boolean(process.env.TRAVIS_BUILD_DIR), "--token=" + process.env.KUBERNETES_TOKEN, "--server=" + "https://" + process.env.KUBERNETES_HOST + ":443"];
        try
        {
            var cmd = command.join(" ");
            console.log(cmd);
            cp.execSync(cmd);
        }
        catch (e)
        {
            //throw a generic error to avoid leaking secrets
            throw "an error occurred while deploying";
        }
    }
});