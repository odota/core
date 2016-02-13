var express = require('express');
var donate = express.Router();
var config = require('../config');
var async = require("async");
var moment = require('moment');
var stripe_secret = config.STRIPE_SECRET;
var stripe_public = config.STRIPE_PUBLIC;
var stripe = require('stripe')(stripe_secret);
var braintree = require("braintree");
var gateway = braintree.connect({
  environment: config.NODE_ENV !== "development" ? braintree.Environment.Production 
                    : braintree.Environment.Sandbox,
  merchantId: config.BRAIN_TREE_MERCHANT_ID,
  publicKey: config.BRAIN_TREE_PUBLIC_KEY,
  privateKey: config.BRAIN_TREE_PRIVATE_KEY
});

module.exports = function(db, redis) {
    donate.route('/carry').get(function(req, res, next) {
        db.from('players').where('cheese', '>', 0).limit(50).orderBy('cheese', 'desc')
        .asCallback(function(err, results) {
            if (err) {
                return next(err);
            }
            
            if (req.user) {
                db.from("subscriptions").where({
                    account_id: req.user.account_id
                }).asCallback(function(err, sub) {
                    if (err) return next(err);
                    res.render("carry", {
                        users: results,
                        stripe_public: stripe_public,
                        subscription: sub
                    });
                });
            } else {
                res.render("carry", {
                    users: results,
                    stripe_public: stripe_public
                });
            }
        });
    })
    donate.route("/stripe_checkout").post(function(req, res, next) {
        var amount = Number(req.body.amount);
        var subscription = req.body.subscription !== "false";
        var token = req.body.token;
        
        if (!token || isNaN(amount)) {
            return res.sendStatus(500);
        }
        
        console.log("Got token %s", token.id);
        
        if (subscription) {
            stripe.customers.create({
                source: token.id,
                plan: 1,
                quantity: amount, // Plan is $1/cheese/month
                email: token.email
            }, function(err, customer) {
                if (err) {
                    return res.send(checkErr(err));
                }
                
                if (req.user) {
                    db('subscriptions').insert({
                        account_id: req.user.account_id,
                        customer_id: customer.id,
                        amount: amount,
                        active_until: moment().add(1, "M").format("YYYY-MM-DD")
                    }).asCallback(function(err) {
                        if (err) return res.send(checkErr());
                        
                        console.log("Added subscription for %s, cusomer id %s",
                                    req.user.account_id,
                                    customer.id);
                        
                        req.session.cheeseAmount = amount;
                        req.session.subscription = 1; // Signed in
                        return res.sendStatus(200);
                    });
                    
                } else {
                    req.session.cheeseAmount = amount;
                    req.session.subscription = 2; // Not signed in
                    return res.sendStatus(200);
                }
            });
        
        } else {
            stripe.charges.create({
                amount: amount * 100,
                currency: "usd",
                source: token.id,
                description: "Buying " + amount + " cheese!"
            }, function(err, charge) {
                if (err) {
                    return res.send(checkErr(err));
                }
                
                addCheeseAndRespond(req, res, amount);
            });
        }
    });
    donate.route("/stripe_endpoint").post(function(req, res, next) {
        var id = req.body.id;
        console.log("Got a event from Stripe, id %s", id);
        // Get the event from Stripe to verify
        stripe.events.retrieve(id, function(err, event) {
            if (err) {
                return res.sendStatus(400);
            }
            
            // Only care about charge succeeded or subscription ended
            if (event.type !== "charge.succeeded" && event.type !== "customer.subscription.deleted") {
                return res.sendStatus(200);
            }
            
            // Check that we haven't seen this before
            redis.lrange("stripe:events", 0, 1000, function(err, result) {
                if (err) {
                    console.log(err);
                    return res.sendStatus(400); // Redis is derping, have Stripe send back later
                }
                
                for (var i = 0; i < result.length; i++) {
                    if (result[i] === id) {
                        console.log("Found event %s in redis.", id);
                        return res.sendStatus(200);
                    }
                }
                
                // New event
                if (event.type === "charge.succeeded") {
                    var amount = event.data.object.amount/100;
                    
                    console.log("Event %s: Charge succeeded for %s.", id, amount);
                    
                    // Update cheese goal
                    redis.incrby("cheese_goal", amount, function(err, val) {
                        if (!err && val === Number(amount)) {
                            // this condition indicates the key is new
                            // Set TTL to end of the month
                            redis.expire("cheese_goal", moment().endOf("month").unix() - moment().unix());
                        } else {
                            console.log("Failed to increment cheese_goal");
                        }
                        
                        var customer = event.data.object.customer;
                        if (customer) { // Subscription, associate with user if possible
                            console.log("Event %s: Charge belongs to customer %s.", id, customer);
                            
                            db('subscriptions')
                            .returning("account_id")
                            .update({
                                active_until: moment().add(1, "M").format("YYYY-MM-DD")
                            })
                            .where({
                                customer_id: customer
                            })
                            .asCallback(function(err, sub) {
                                if (err) return res.sendStatus(400); // Postgres derping
                                if (sub && sub.length > 0) {
                                    console.log("Event %s: Found customer %s, account_id is %s", id, customer, sub[0]);
                                     db('players')
                                    .increment("cheese", amount || 0)
                                    .where({
                                        account_id: sub[0]
                                    })
                                    .asCallback(function(err, result) {
                                        if (err) return res.sendStatus(400);
                                        console.log("Event %s: Incremented cheese of %s", id, sub[0]);
                                        addEventAndRespond(id, res);
                                    });
                                } else {
                                    console.log("Event %s: Did not find customer %s.", id, customer);
                                    addEventAndRespond(id, res);
                                }
                            });
                        } else {
                            addEventAndRespond(id, res);
                        }
                    });
                } else if (event.type === "customer.subscription.deleted") {
                    // Our delete process should delete the subscription, but make sure.
                    var customer = event.data.object.customer;
                    console.log("Event %s: Customer %s being deleted.", id, customer);
                    
                    db("subscriptions")
                    .where({
                        customer_id: customer
                    }).del()
                    .asCallback(function(err, result) {
                        if (err) return res.sendStatus(400);
                        
                        addEventAndRespond(id, res);
                    });
                } else { // Shouldn't happen
                    res.sendStatus(200);
                }
            });
        });
    });
    donate.route("/brain_tree_client_token").get(function (req, res) {
      gateway.clientToken.generate({}, function (err, response) {
        if (err) {
            return res.sendStatus(400);
        }
        res.send(response.clientToken);
      });
    });
    donate.route("/brain_tree_checkout").post(function(req, res) {
        var amount = Number(req.body.amount);
        var nonce = req.body.nonce;
        
        if (!nonce || isNaN(amount)) {
            return res.sendStatus(500);
        }
        
        var saleRequest = {
            amount: amount,
            paymentMethodNonce: nonce,
            orderId: "Mapped to PayPal Invoice Number",
            options: {
                paypal: {
                    description: "YASP - Buying " + amount + " cheese!",
                },
                submitForSettlement: true
            }
        };
        
        gateway.transaction.sale(saleRequest, function (err, result) {
            if (err || !result.success) {
                res.send(checkErr(err));
            }
            
            redis.incrby("cheese_goal", amount, function(err, val) {
                if (!err && val === Number(amount)) {
                    // this condition indicates the key is new
                    // Set TTL to end of the month
                    redis.expire("cheese_goal", moment().endOf("month").unix() - moment().unix());
                } else {
                    console.log("Failed to increment cheese_goal");
                }
                
                addCheeseAndRespond(req, res, amount);
            });
        });
    })
    donate.route('/thanks').get(function(req, res) {
        var cheeseCount = req.session.cheeseAmount || 0;
        var cheeseTotal = req.user ? (req.user.cheese || 0) : cheeseCount;
        var subscription = req.session.subscription;
        var cancel = req.session.cancel;
        
        clearPaymentSessions(req);
        res.render("thanks", {
            cheese: cheeseCount,
            total: cheeseTotal,
            subscription: subscription,
            cancel: cancel
        });
    });
    donate.route("/cancel").get(function(req, res, next) {
        if (!req.user) return res.render("cancel", {
            sub: false
        });
        
        db("subscriptions")
        .where({
            account_id: req.user.account_id
        })
        .asCallback(function(err, sub) {
            if (err) return next(err);
            res.render("cancel", {
                sub: sub
            });
        });
    }).post(function(req, res, next) {
        db("subscriptions")
        .where({
            account_id: req.user.account_id
        })
        .asCallback(function(err, subs) {
            if (err) {
                return next(err);
            }
            
            async.each(subs, function(sub, cb) {
                stripe.customers.del(sub.customer_id, function(err, result) {
                    // Indicates the subscription has already been deleted. 
                    if (err && err.rawType !== "invalid_request_error") return cb(err);
                    db("subscriptions")
                    .where({
                        customer_id: sub.customer_id
                    })
                    .del()
                    .asCallback(cb);
                })
            }, function(err) {
                if (err) return next(err);
                
                req.session.cancel = true;
                res.redirect("/thanks");
            });
        });
    });

    return donate;
    
    function addCheeseAndRespond(req, res, amount) {
        if (req.user) {
             db('players')
            .increment("cheese", amount || 0)
            .where({
                account_id: req.user.account_id
            }).asCallback(function(err) {
                if (err) return res.send(
                    "There was a problem processing your subscription." 
                    + " Please email support@yasp.co");
                
                req.session.cheeseAmount = amount;
                res.sendStatus(200);
            });
        } else {
            req.session.cheeseAmount = amount;
            return res.sendStatus(200);
        }
    }
    
    function addEventAndRespond(id, res) {
        redis.lpush("stripe:events", id);
        redis.ltrim("stripe:events", 0, 1000);
        res.sendStatus(200);
    }
    
    function checkErr(err) {
        if (err.raw_type === "card_error") {
            return "There was a problem processing your card. " +
                   "Did you enter the details correctly?";
        } else {
            return "There was a problem processing your request. " + 
                   "If you're trying to make a subscription, only credit/debit cards are supported. " +
                   "If you keep getting errors, please send us an email " +
                   "at support@yasp.co. Thanks!";
        }
    }
    
    function clearPaymentSessions(req) {
        req.session.cheeseAmount = null;
        req.session.subscription = null;
        req.session.cancel = null;
    }
};