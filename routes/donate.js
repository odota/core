var express = require('express');
var donate = express.Router();
var paypal = require('paypal-rest-sdk');
var config = require('../config');
var paypal_id = config.PAYPAL_ID;
var paypal_secret = config.PAYPAL_SECRET;
var PAYMENT_SESSIONS = ["cheeseAmount", "cheeseTotal", "payerId", "paymentId", "paymentToken"];
var root_url = config.ROOT_URL;
var moment = require('moment');
var url = require('url');

paypal.configure({
    'mode': config.NODE_ENV === "production" ? 'live' : 'sandbox', //sandbox or live
    'client_id': paypal_id,
    'client_secret': paypal_secret
});

var create_webhook_json = {
    "url": root_url.replace("http", "https") + "/paypal_webhook",
    "event_types": [
        {
            "name": "PAYMENT.AUTHORIZATION.CREATED"
        }
    ]
};

console.log(create_webhook_json);
paypal.notification.webhook.create(create_webhook_json, function (error, webhook) {
    if (error) {
        console.log(error.response);
        throw error;
    } else {
        console.log("Create webhook Response");
        console.log(webhook);
    }
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
        var subscription = req.body.subscription;
        
        if (subscription === "on" && !isNaN(num)) {
            var billingPlanAttributes = {
                "description": "Cheese Subscription to YASP",
                "merchant_preferences": {
                    "auto_bill_amount": "yes",
                    "cancel_url": root_url + "/cancel",
                    "initial_fail_amount_action": "continue",
                    "max_fail_attempts": "1",
                    "return_url": root_url + "/confirm-subscription",
                    "setup_fee": {
                        "currency": "USD",
                        "value": "0"
                    }
                },
                "name": "Monthly Cheese Sub",
                "payment_definitions": [
                    {
                        "amount": {
                            "currency": "USD",
                            "value": num,
                        },
                        "cycles": "0",
                        "frequency": "MONTH",
                        "frequency_interval": "1",
                        "name": "Monthly Cheese",
                        "type": "REGULAR"
                    }
                ],
                "type": "INFINITE"
            };
            
            // Create billing plan
            paypal.billingPlan.create(billingPlanAttributes, function(err, billingPlan) {
                if (err) {
                    return next(err);
                }
                
                var billingPlanUpdateAttributes = [
                    {
                        "op": "replace",
                        "path": "/",
                        "value": {
                            "state": "ACTIVE"
                        }
                    }
                ];
            
                // Active the billing plan
                paypal.billingPlan.update(billingPlan.id, billingPlanUpdateAttributes, function(err, response) {
                    if (err) {
                        return next(err);
                    }
                    
                    // Paypal seems to be stupid and won't let me use isostring even though it says it
                    // expects it in their documentation.
                    var billingAgreementAttributes = {
                        "name": "YASP Cheese Agreement",
                        "description": "Agreement for a Monthly Cheese Subscription",
                        "start_date": moment().add(1, 'd').format("YYYY-MM-DD[T]HH:mm:ss[Z]"),
                        "plan": {
                            "id": billingPlan.id
                        },
                        "payer": {
                            "payment_method": "paypal"
                        }
                    };

                    console.log(billingAgreementAttributes);
                    // Create the billing agreement
                    paypal.billingAgreement.create(billingAgreementAttributes, function (err, billingAgreement) {
                        if (err) {
                            return next(err);
                        }
                        
                        for (var index = 0; index < billingAgreement.links.length; index++) {
                            if (billingAgreement.links[index].rel === 'approval_url') {
                                var approval_url = billingAgreement.links[index].href;
                                console.log("For approving subscription via Paypal, first redirect user to");
                                console.log(approval_url);
                                req.session.paymentToken = url.parse(approval_url, true).query.token;
                                req.session.cheeseAmount = num;
                                res.redirect(approval_url);
                            }
                        }
                    });
                })
                
            })
            
            
        } else if (!isNaN(num)) {
            
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
            });
        } else {
            next("Did not get a number for cheese amount.");
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
    donate.route('/confirm-subscription').get(function(req, res, next) {
        var cheeseAmount = req.session.cheeseAmount;
        if (cheeseAmount) {
            res.render("confirm-subscription", {
                cheeseAmount: cheeseAmount
            });    
        } else {
            clearPaymentSessions(req);
            res.render("cancel");
        }
    }).post(function(req, res, next) {
        var paymentToken = req.session.paymentToken;
        if (!paymentToken) {
            clearPaymentSessions(req);
            return next("No payment token.");
        }
        
        paypal.billingAgreement.execute(paymentToken, {}, function (err, billingAgreement) {
            if (err) {
                clearPaymentSessions(req);
                return next(err);
            }
            
            res.redirect("/thanks");
            
            clearPaymentSessions(req);
        });
    });
    donate.route("/paypal_webhook").post(function(req, res, next) {
  
    });
    donate.route('/thanks').get(function(req, res) {
        var cheeseCount = req.session.cheeseAmount || 0;
        var cheeseTotal = req.user ? (req.user.cheese || cheeseCount) : cheeseCount;
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