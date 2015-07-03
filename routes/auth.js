var express = require('express');
var app = express.Router();
var db = require('../db');
var passport = require('../passport');
var queueReq = require('../operations').queueReq;
var buildSets = require('../tasks/buildSets');
app.route('/login').get(passport.authenticate('steam', {
    failureRedirect: '/'
}));
app.route('/return').get(passport.authenticate('steam', {
    failureRedirect: '/'
}), function(req, res, next) {
    db.players.findOne({
        account_id: req.user.account_id
    }, function(err, doc) {
        if (err) {
            return next(err);
        }
        if (doc) {
            //don't update join date if we have this in db already
            delete req.user["join_date"];
        }
        db.players.update({
            account_id: req.user.account_id
        }, {
            $set: req.user
        }, {
            upsert: true
        }, function(err) {
            if (err) {
                return next(err);
            }
            //rebuild sets since a player just logged in and might need to be retracked
            buildSets(function(err, cb) {
                if (err) {
                    //had issues rebuilding set, but move on anyway
                    console.log(err);
                }
                queueReq("fullhistory", req.user, function(err, job) {
                    if (err) {
                        return next(err);
                    }
                    res.redirect('/players/' + req.user.account_id);
                });
            });
        });
    });
});
app.route('/logout').get(function(req, res) {
    req.logout();
    req.session.destroy(function() {
        res.redirect('/');
    });
});
module.exports = app;