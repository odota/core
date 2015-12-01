var express = require('express');
var donate = express.Router();
var config = require('../config');
var stripe_secret = config.STRIPE_SECRET;
var stripe_public = config.STRIPE_PUBLIC;
var stripe = require('stripe')(stripe_secret);
var root_url = config.ROOT_URL;
var moment = require('moment');
var url = require('url');
var planToID = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    20: 20,
    30: 30,
    40: 40,
    50: 50,
    75: 75,
    100: 100,
    150: 150
};

module.exports = function(db, redis) {
    donate.route('/carry').get(function(req, res, next) {
        db.from('players').where('cheese', '>', 0).limit(50).orderBy('cheese', 'desc')
        .asCallback(function(err, results) {
            if (err) return next(err);
            res.render("carry", {
                users: results,
                stripe_public: stripe_public
            });
        });
    }).post(function(req, res, next) {
        console.log(req.body);
        var amount = Number(req.body.amount);
        var subscription = req.body.subscription != "false";
        var token = req.body.token;
        
        console.log(subscription)
        
        if (!token || amount == "NaN") {
            return res.sendStatus(500);
        }
        
        if (!subscription) {
            stripe.charges.create({
                amount: amount * 100,
                currency: "usd",
                source: token,
                description: "Buying " + amount + " cheese!"
            }, function(err, charge) {
                console.log(err)
                if (err) return res.sendStatus(500);
                req.session.cheeseAmount = amount;
                res.sendStatus(200);
            })
        }
        
        
        if (!planToID[amount]) {
            console.log("Couldn't find");
            res.sendStatus(500);
        }
        
        stripe.customers.create({
            source: token,
            //TODO
        })
        
        
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
    donate.route("/stripe_endpoint").post(function(req, res, next) {
  
    });
    donate.route('/thanks').get(function(req, res) {
        var cheeseCount = req.session.cheeseAmount || 0;
        var cheeseTotal = req.user ? (req.user.cheese || 0) + cheeseCount : cheeseCount;
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