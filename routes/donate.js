var express = require('express');
var donate = express.Router();
var config = require('../config');
var stripe_secret = config.STRIPE_SECRET;
var stripe_public = config.STRIPE_PUBLIC;
var stripe = require('stripe')(stripe_secret);
var root_url = config.ROOT_URL;
var moment = require('moment');
var url = require('url');

module.exports = function(db, redis) {
    donate.route('/carry').get(function(req, res, next) {
        db.from('players').where('cheese', '>', 0).limit(50).orderBy('cheese', 'desc')
        .asCallback(function(err, results) {
            if (err) return next(err);
            if (req.user) {
                db.from("subscriptions").where({
                    account_id: req.user.account_id
                }).asCallback(function(err, sub) {
                    if (err) return next(err);
                    
                    res.render("carry", {
                        users: results,
                        stripe_public: stripe_public,
                        sub: sub
                    })
                })
            } else {
                res.render("carry", {
                    users: results,
                    stripe_public: stripe_public
                });
            }
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
        
        if (subscription) {
            stripe.customers.create({
                source: token.id,
                plan: 1,
                quantity: amount, // Plan is $1/cheese/month
                email: token.email
            }, function(err, customer) {
                if (err) {
                    console.log(err)
                    var message = checkErr(err);
                    return res.status(500).send(message);
                }
                
                if (req.user) {
                    db('subscriptions').insert({
                        account_id: req.user.account_id,
                        customer_id: customer.id,
                        amount: amount,
                        active_until: moment().add(1, "M").format("YYYY-MM-DD")
                    }).asCallback(function(err) {
                        if (err) return res.status(500).send(
                            "There was a problem processing your subscription." 
                            + " Please email support@yasp.co");
                        
                        console.log("Added subscription for %s, cusomer id %s",
                                    req.user.account_id,
                                    customer.id);
                        
                        req.session.cheeseAmount = amount;
                        req.session.subscription = 1; // Signed in
                        return res.sendStatus(200);
                    })
                    
                } else {
                    req.session.cheeseAmount = amount;
                    req.session.subscription = 2; // Not signed in
                    return res.sendStatus(200);   
                }
            })
        
        } else {
            stripe.charges.create({
                amount: amount * 100,
                currency: "usd",
                source: token.id,
                description: "Buying " + amount + " cheese!"
            }, function(err, charge) {
                if (err) {
                    console.log(err)
                    var message = checkErr(err);
                    
                    return res.status(500).send(message);
                }
                
                if (req.user) {
                     db('players')
                    .increment("cheese", amount || 0)
                    .where({
                        account_id: req.user.account_id
                    }).asCallback(function(err) {
                        if (err) return res.status(500).send(
                            "There was a problem processing your subscription." 
                            + " Please email support@yasp.co");
                        
                        req.session.cheeseAmount = amount;
                        res.sendStatus(200);
                    });
                } else {
                    req.session.cheeseAmount = amount;
                    return res.sendStatus(200);
                }
            })
        }
    });
    donate.route('/thanks').get(function(req, res) {
        var cheeseCount = req.session.cheeseAmount || 0;
        var cheeseTotal = req.user ? (req.user.cheese || 0) + cheeseCount : cheeseCount;
        var subscription = req.session.subscription;
        
        clearPaymentSessions(req);
        res.render("thanks", {
            cheese: cheeseCount,
            total: cheeseTotal,
            subscription: subscription
        });
    });
    donate.route("/cancel").get(function(req, res, next) {
        if (!req.user) return res.render("/cancel", {
            sub: false
        });
        
        db("subscriptions")
        .where({
            account_id: req.user.account_id
        })
        .asCallback(function(err, sub) {
            if (err) return next(err);
            var sub = false;
            
            if (sub) {
                sub = true;
            }
            
            res.render("/cancel", {
                sub: true
            })
        })
    }).post(function(req, res, next) {
        db("subscriptions")
        .where({
            account_id: req.user.account_id
        })
        .del()
        .asCallback(function(err) {
            if (err) return next(err);
            
            res.redict("thanks", {
                cancel: true
            })
        })
    })
    donate.route("/stripe_endpoint").post(function(req, res, next) {
        var id = req.body.id;
        console.log("Got a event from Stripe, id %s", id);
        // Get the event from Stripe to verify
        stripe.events.retrieve(id, function(err, event) {
            if (err) return res.sendStatus(400);
            
            // Only care about charge succeeded or subscription ended
            if (event.type !== "charge.succeeded" && event.type !== "customer.subscription.deleted") {
                return res.sendStatus(200);
            }
            
            // Check that we haven't seen this before
            redis.lrange("stripe:events", 0, 1000, function(err, result) {
                if (err) return res.sendStatus(400); // Redis is derping, have Stripe send back later

                for (var e in result) {
                    
                    if (e == id) {
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
                        if (!err && val == amount) {
                            // this condition indicates the key is new
                            redis.expire("cheese_goal", 86400 - moment().unix() % 86400);
                        }
                        
                        var customer = event.data.object.customer;
                        if (customer) { // Subscription, associate with user if possible
                            console.log("Event %s: Charge belongs to customer %s.", id, customer);
                            
                            db.select().from("subscriptions").where({
                                customer_id: customer
                            })
                            .asCallback(function(err, sub) {
                                if (err) return res.sendStatus(400); // Postgres derping
                                
                                // Update the cheese amount and the subscription
                                if (sub) {
                                    console.log("Event %s: Found customer %s.", id, customer);
                                     db('players')
                                    .increment("cheese", amount || 0)
                                    .where({
                                        account_id: sub.account_id
                                    });
                                    
                                    db('subscriptions')
                                    .update({
                                        active_until: moment().add(1, "M").format("YYYY-MM-DD")
                                    })
                                    .where({
                                        account_id: sub.account_id,
                                        customer_id: sub.customer_id
                                    });
                                    
                                    addEventAndRespond(id, res);
                                    
                                } else {
                                    console.log("Event %s: Did not find customer %s.", id, customer);
                                }
                            })
                        } else {
                            addEventAndRespond(id, res);
                        }
                    })
                } else if (event.type === "customer.subscription.deleted") {
                    
                    var customer = event.data.object.customer
                    console.log("Event %s: Customer %s being deleted.", id, customer);
                    
                    db("subscriptions")
                    .where({
                        customer_id: customer
                    }).del()
                    .asCallback(function(err, result) {
                        if (err) return res.sendStatus(400);
                        
                        addEventAndRespond(id, res);
                    })
                } else { // Shouldn't happen
                    res.sendStatus(200);
                }
            });
        })
    });
    return donate;
    
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
                   "If errors keep happening, please send us an email " +
                   "at support@yasp.co. Thanks!";
        }
    }
    
    function clearPaymentSessions(req) {
        req.session.cheeseAmount = null;
        req.session.subscription = null;
    }
};