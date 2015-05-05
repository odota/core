var operations = require('../operations');
var queueReq = operations.queueReq;
var multiparty = require('multiparty');
var express = require('express');
var redis = require('../redis').client;
var upload = express.Router();
var Recaptcha = require('recaptcha').Recaptcha;
var rc_public = process.env.RECAPTCHA_PUBLIC_KEY;
var rc_secret = process.env.RECAPTCHA_SECRET_KEY;
var MATCHES_KEY_PREFIX = "match:";
var recaptcha = new Recaptcha(rc_public, rc_secret);
upload.get("/", function(req, res) {
    res.render("upload", {
        recaptcha_form: recaptcha.toHTML(),
    });
});
upload.post("/", function(req, res) {
    if (req.session.captcha_verified || process.env.NODE_ENV === "test") {
        req.session.captcha_verified = false; //Set back to false
        var form = new multiparty.Form();
        form.parse(req, function(err, fields, files) {
            if (err) {
                return close(err);
            }
            if (fields.match_id) {
                var match_id = Number(fields.match_id[0]);
                console.log(match_id);
                queueReq("api_details", {
                    match_id: match_id,
                    request: true,
                    priority: "high"
                }, close);
            }
            if (files.replay) {
                var fileName = files.replay[0].path;
                console.log(fileName);
                queueReq("parse", {
                    fileName: fileName,
                    upload: true,
                    priority: "high"
                }, close);
            }
        });
    }

    function close(err, job) {
        if (job) {
            console.log(job.data.payload);
            job.on("complete", function(result) {
                if (result.error) {
                    return res.render("upload", {
                        error:  result.error,
                        recaptcha_form: recaptcha.toHTML()
                    });
                }
                else {
                    // clear the cache
                    redis.del(MATCHES_KEY_PREFIX + result.match_id, function(err, resp) {
                        return res.redirect("matches/" + result.match_id);    
                    });
                }
            });
        }
        else {
            return res.render("upload", {
                error: err,
                recaptcha_form: recaptcha.toHTML()
            });
        }
    }
});
module.exports = upload;