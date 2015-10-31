var express = require('express');
var donate = express.Router();
var paypal = require('paypal-rest-sdk');
var config = require('../config');
var paypal_id = config.PAYPAL_ID;
var paypal_secret = config.PAYPAL_SECRET;
var PAYMENT_SESSIONS = ["cheeseAmount", "cheeseTotal", "payerId", "paymentId"];
var root_url = config.ROOT_URL;
var moment = require('moment');
paypal.configure({
    'mode': config.NODE_ENV === "production" ? 'live' : 'sandbox', //sandbox or live
    'client_id': paypal_id,
    'client_secret': paypal_secret
});
module.exports = function(db, redis) {
    donate.route('/carry').get(function(req, res, next) {
        db.from('players').where('cheese', '>', 0).limit(50).orderBy('cheese', 'desc').asCallback(function(err, results) {
            if (err) return next(err);
            res.render("carry", {
                users: results
            });
        });
    }).post(function(req, res, next) {
        var num = req.body.num;
        if (!isNaN(num)) {
            var payment = {
                "intent": "sale",
                "payer": {
                    "payment_method": "paypal"
                },
                "redirect_urls": {
                    "return_url": root_url + "/confirm",
                    "cancel_url": root_url + "/cancel"
                },
                "transactions": [{
                    "amount": {
                        "total": num,
                        "currency": "USD"
                    },
                    "description": "Buying CHEESE x" + num
        }]
            };
            paypal.payment.create(payment, function(err, payment) {
                if (err) {
                    return next(err);
                }
                else {
                    req.session.paymentId = payment.id;
                    req.session.cheeseAmount = num;
                    var redirectUrl;
                    for (var i = 0; i < payment.links.length; i++) {
                        var link = payment.links[i];
                        if (link.method === 'REDIRECT') {
                            redirectUrl = link.href;
                        }
                    }
                    res.redirect(redirectUrl);
                }
            });
        }
    });
    donate.route('/confirm').get(function(req, res, next) {
        var cheeseAmount = req.session.cheeseAmount;
        req.session.payerId = req.query.PayerID;
        if (cheeseAmount) {
            res.render("confirm", {
                cheeseAmount: cheeseAmount
            });
        }
        else {
            clearPaymentSessions(req);
            res.render("cancel");
        }
    }).post(function(req, res, next) {
        var paymentId = req.session.paymentId;
        var cheeseAmount = req.session.cheeseAmount;
        var payerId = req.session.payerId;
        var details = {
            "payer_id": payerId
        };
        paypal.payment.execute(paymentId, details, function(err, payment) {
            if (err) {
                clearPaymentSessions(req);
                next(err);
            }
            else {
                redis.incrby("cheese_goal", cheeseAmount, function(err, val) {
                    if (!err && val == cheeseAmount) {
                        // cheeseAmount is string, val is number, just let JS cast
                        // this condition indicates the key is new
                        redis.expire("cheese_goal", 86400 - moment().unix() % 86400);
                    }
                    if (req.user && payment.transactions[0]) {
                        db('players')
                        .increment("cheese", parseInt(payment.transactions[0].amount.total, 10) || 0)
                        .where({
                            account_id: req.user.account_id
                        }).asCallback(function(err) {
                            if (err) {
                                return next(err);
                            }

                            res.redirect("/thanks");
                        });
                    }
                    else {
                        res.redirect("/thanks");
                    }
                });
            }
        });
    });
    donate.route('/thanks').get(function(req, res) {
        var cheeseCount = req.session.cheeseAmount;
        var cheeseTotal = req.user.cheese;
        clearPaymentSessions(req);
        res.render("thanks", {
            cheese: cheeseCount,
            total: cheeseTotal
        });
    });
    donate.route('/cancel').get(function(req, res) {
        clearPaymentSessions(req);
        res.render("cancel");
    });
    return donate;

    function clearPaymentSessions(req) {
        PAYMENT_SESSIONS.forEach(function(s) {
            req.session[s] = null;
        });
    }
};