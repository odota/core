{{{
  "title": "Infrastructure and Subscriptions",
  "tags": ["release"],
  "date": "12-7-2015",
  "author": "Albert"
}}}

Improving YASP's stability and reliability has always been a primary goal of ours.

<!--more-->

Over the past ten months, we've rewritten our system archtecture multiple times to allow us to (hopefully)
be more and more reliable. We're running a microservice archtecture where each service can fail and crash
without disrupting the others. This also allows us to distribute our services over multiple machines
for more reliabaility and availability.

Our long time users have probrobably experienced something like this before:

<img style="height: 400px;margin: 0 auto;display: block;" src="http://i.imgur.com/4G31LEv.png">

During [peak hours](http://yasp.co/mmstats) YASP is usually behind on parsing games. Instead of the
normal five to ten minutes after a game for parsed data to be available, you might not see it until four hours later.
Clearly not the best.

We've recently migrated our parse service to Google Cloud Compute, which allows us to dynamically scale the service
higher or lower depending on the load. This means that hopefully long parse waits are a thing of the past.
We've seen some great results so far.

Here's an example of the server cluster. The unchecked server is about to go down because of the decreased load.

<img style="height: 400px;margin: 0 auto;display: block;" src="http://i.imgur.com/g52WrEB.png">

And here you can see how our servers have scaled over time:

<img style="height: 400px;margin: 0 auto;display: block;" src="http://i.imgur.com/xsdltUS.png">

We're really excited about this change!

We've also moved our payment service from Paypal to Stripe, and with that, we're now supporting
[subscriptions and bitcoin payments](/carry).

We've always offered all of our parse features for free and this will never change. YASP continues to operate
in a not-for-profit manner. Devs are not paid, and all our money goes back to the servers.

Subscriptions give users no extra features beyond the normal cheese benefits. It's just a way for those who wish to give some
reliable, monthly revenue. With a more reliable revenue stream, we'll be able to better adjust our server expendatures to give 
our users the best experience we can.