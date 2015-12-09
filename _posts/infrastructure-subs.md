{{{
  "title": "Infrastructure and Subscriptions",
  "tags": ["release"],
  "date": "12-9-2015",
  "author": "Albert"
}}}

Improving YASP's stability and reliability has always been a primary goal of ours.

<!--more-->

Over the past ten months, we've rewritten our system architecture multiple times to allow us to (hopefully)
be more and more reliable. We're running a microservice architecture where each service can fail and crash
without disrupting the others. Microservices allow us to distribute our processes over multiple machines
for more reliability and availability.

Our long time users have probably experienced something like this before:

<img style="margin: 0 auto;display: block;" src="http://i.imgur.com/4G31LEv.png">

During [peak hours](http://yasp.co/mmstats), YASP is usually behind on parsing games. Instead of the
normal five to ten minutes after a game for parsed data to be available, you might not see it until four hours later.
Clearly not the best! We've recently migrated our parse service to Google Cloud Compute which allows us to dynamically 
scale the service higher or lower depending on the load. In short: hopefully long parse waits are a thing of the past.

We've seen some great results so far. Here's an example of the server cluster. 
The unchecked server is about to go down because of the decreased load.

<img style="margin: 0 auto;display: block;" src="http://i.imgur.com/g52WrEB.png">

Here you can see how our servers have scaled over time:

<img style="margin: 0 auto;display: block;" src="http://i.imgur.com/xsdltUS.png">

We're really excited about this change!

We've also moved our payment service from Paypal to Stripe, and with that, we're now supporting
[subscriptions and Bitcoin payments](/carry). We've always offered all of our match parsing for free, and this will never change. 
We continue to operate in a not-for-profit manner. Devs are not paid, and all our revenue goes directly back to running the servers.
Subscriptions give users no extra features beyond the normal cheese benefits. It's just a way for our extra generous users to give us
reliable, monthly revenue. With a more reliable revenue stream, we can plan better for the future and continue to give our users the 
best experience we can.