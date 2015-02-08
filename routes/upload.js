var utility = require('../utility');
var domain = require('domain');
var multiparty = require('multiparty');
var db = require('../db');
var express = require('express');
var upload = express.Router();
var Recaptcha = require('recaptcha').Recaptcha;
var rc_public = process.env.RECAPTCHA_PUBLIC_KEY;
var rc_secret = process.env.RECAPTCHA_SECRET_KEY;
var recaptcha = new Recaptcha(rc_public, rc_secret);
upload.get("/", function(req, res) {
    res.render("upload", {
        recaptcha_form: recaptcha.toHTML(),
    });
});
upload.post("/", function(req, res) {
    if (req.session.captcha_verified || process.env.NODE_ENV === "test") {
        req.session.captcha_verified = false; //Set back to false
        var d = domain.create();
        d.on('error', function() {
            if (!res.headerSent) {
                res.render("upload", {
                    error: "Couldn't parse replay"
                });
            }
        });
        d.run(function() {
            var parser = utility.runParse(function(err, output) {
                if (err) {
                    throw err;
                }
                var match_id = output.match_id;
                console.log("getting upload data from api");
                var container = utility.generateJob("api_details", {
                    match_id: match_id
                });
                utility.getData(container.url, function(err, data) {
                    if (err) {
                        throw err;
                    }
                    var match = data.result;
                    match.parsed_data = output;
                    match.parse_status = 2;
                    match.upload = true;
                    db.matches.update({
                        match_id: match_id
                    }, {
                        $set: match
                    }, {
                        upsert: true
                    }, function(err) {
                        if (err) {
                            throw err;
                        }
                        res.redirect("/matches/" + match_id);
                    });
                });
            });
            var form = new multiparty.Form();
            form.on('part', function(part) {
                if (part.filename) {
                    part.pipe(parser.stdin);
                }
            });
            form.on('error', function(err) {
                parser.kill();
                throw err;
            });
            form.parse(req);
        });
    }
});
module.exports = upload;