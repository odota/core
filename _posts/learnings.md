{{{
  "title": "Lessons learned from parsing 10 million replays",
  "date": "5-1-2016",
  "author": "Howard",
  "draft": true
}}}

Working on this project has been a highly educational experience for both of us.

Here are some of the things we learned along the way:

* Origins
  * Started in August 2014
  * @albertcui found some replay parsing libraries on GitHub.  We wondered what data we could get from Dota replays.
  * [clarity](https://github.com/skadistats/clarity)
    * Our replay parsing library of choice.
    * Why'd we pick it?
      * Documentation is important.  It had the best examples/documentation of all the choices we looked at.
  * The idea was that we'd build some fun feature for ourselves, and be able to deploy it rapidly to hundreds of users.
  * No business plan/monetization.  We were still both in school at the time and not really interested in making a profit.
    * Still basically the same, we subsist on donations and lower the goal to match our hardware costs.
* Data volume
  * People play a ton of Dota!  Some quick numbers:
    * ~1.2 billion public matches total
      * Why is the match ID up to 2.3 billion?  Not all IDs end up finishing as public games.
    * ~1.1 million matches a day, 1.4 million on weekends
    * Importing every match will take you a couple of months.  Don't do it lightly.
    * The rate of matches has a pretty regular daily cycle.  Make sure your application can hold up during peak hours.
  * 3 matches a day rule
    * We found that users typically play around 3 matches a day.  This number decreases as you scale to thousands of users because of match overlap.
      * Use this to help you with capacity planning in the early stages.
* Reddit posts/traffic spikes
  * We got 1000 users from the first [post](https://www.reddit.com/r/DotA2/comments/2sp595/introducing_yasp_a_free_opensource_stats_website/) in January 2015.  We were only expecting 100 or so.  Oops!
  * The uncontrollable flood of frontpage.  Reddit can and will hug your site to death.  Once your post makes it to frontpage you can't really stop the influx.
  * Either plan ahead before you go public or be prepared to explain the downtime/queue lengths.
* Scaling
  * Start small, grow with your userbase!
    * Don't try to import every match right away.  It'll cost you a ton of money/time and you probably don't need most of it at first.
  * Use a timeout/inactivity check for expensive operations.
    * A lot of users will visit your site once and never come back.  Don't spend too many resources on them.
    * For us this is parsing replays (orders of magnitude more expensive than just inserting data from the WebAPI).
* Minimizing cost -- how to run as cheaply as possible
  * No employees.  People cost way more than machines.
    * Some quick math: A software engineer costs roughly 100,000 a year/8,000 a month.  In comparison the servers only cost 1,400/month.
    * This means you are going to have to know how to develop your site full-stack yourself.  Don't worry if you're new at this.  You can learn as you go!
  * No marketing.
    * Our plan was to build things and let users spread the news via word-of-mouth.  It won't cost you anything and users find it less intrusive.
    * Avoids the need to spend money on ads or hiring people to advertise for you.
  * Free software.  There are tons of cool projects out there and you can get help from other users.
* Telemetry
  * You'll want to build yourself some kind of status page.
  * Quickly see what's going wrong, so you can fix it.
  * Monitor service: Write code to automatically do status checks.
    * Bonus points: make it email you when something goes wrong
    * Extra bonus points: make it call you so you can be on-call 24/7 and wake up at 3AM to put out fires!
* Config
  * Don't put secrets in your code!  It's really easy to accidentally push them to GitHub, and then you have to deal with rotating them.  This sucks, and people will laugh at you while [Russian hackers pwn your webapp](http://stackoverflow.com/questions/1732348/regex-match-open-tags-except-xhtml-self-contained-tags/1732454#1732454).
  * Put your config settings in one place.  It makes it easy for developers to see what settings can be changed.
* Security
  * Reduce state provided by users.
    * The fewer ways there are for users to provide data the less likely you'll have some security problem.
    * 99.99% of your users can be well-behaved, but that one guy will bring down your site by himself.
  * Ask yourself, what's the worst that could happen if my database got leaked?
* Automate things.  You don't want to be hunting down new strings, etc. every time Valve patches.  Find sources for this data and have scripts to update them.
* Steam API
  * It's not well documented.  Some useful resources:
    * http://dev.dota2.com/showthread.php?t=58317  A quick introduction to your available endpoints and what data you can get.
    * https://lab.xpaw.me/steam_api_documentation.html  Very cool interactive API explorer.
  * It can fail randomly and in weird ways.
    * Seen: blobs with `{}`, blobs with `{status: 1}`, no response at all, etc.  Make sure to identify and handle all the edge cases.
* Replay Parsing
  * Even less supported than the API.
  * Your best bet is to ask the replay parser developer of your chosen library for help.
  * Replays come in .bz2 compressed format, averaging maybe 30MB each.
  * You probably won't able to store a large number of them, so parse them to reduce them to just the data you're interested in.
* Microservices
  * Simplify your code.  Each service should perform a specific task.
  * Fail separately.  One service crashing won't bring down your whole site.
  * Scale individually.  If you find that you're bottlenecked by one worker, you can easily deploy multiple instances of it to scale out.
* Keep backups!
  * Accidentally deleted our data once.  It was a stressful few days to recover.
  * Take a backup before you do any major changes.
* Continuous Integration (Travis CI)
  * Free for open source!
  * Automate your testing/building after every commit.
  * Cool GitHub badge for your repo
* Docker (containers)
  * Run your external code (Postgres, Redis) separately.  You can spin up a new box and rapidly get them running/swap versions if desired.
  * Consistent development environment.  You know what you have running on your devbox will match production since it's all Dockerized.
  * Easy setup.  You can get new developers running with it fairly quickly, instead of having to figure out init scripts for 5 different platforms.
  * Early deployments consisted of us `ssh`ing into a box, `git pull`, then `pm2 reload all`.  You won't want to do this when you have more than 1 node.
  * With Docker you can just kill your container/VM and start a brand new one with the latest image.
* Cloud vs Dedicated
  * Pros of cloud:
    * It's easier to dynamically scale.  
      * More CPU?  Spin up new instances in a matter of seconds.
      * Need more storage?  GCE lets you size whatever disk you want, and even make it bigger on-the-fly.  You can have up to 64TB on a disk, which is way more than most people need.
    * Easy resets.  Need to start from scratch?  Just delete the instance and start over.
    * Great tools/services.  Using the cloud means you get access to an integrated suite of services.  This includes monitoring/logging/deployment/routing tools.
    * Preemptible instances from Google are great for parsing.  They're much cheaper for CPU-bound tasks that can be interrupted.
  * Cons
    * Performance penalty for cloud.  Virtualization means you don't get as much bang for your buck.
    * Storage is expensive in the cloud!  Cloud providers typically give you free data ingress, then charge you to store the data or take it out.  Keep this in mind before committing a large chunk of data to the cloud.
    * Avoid hosted services, just run open-source software on a VM.  It's way cheaper to run Redis on a VM than it is to pay for hosted Redis, etc.  As a bonus you also get to learn how it works.
* SQL vs NoSQL
  * MongoDB.  Our first DB, since MEAN was all the rage (still kinda popular for starting out).  Probably could have gotten it to scale if we spent the time to figure it out, but wanted to try something new.
    * + Fast counts.  You can get the number of items in a collection very quickly.
    * + WiredTiger compression.  Can squeeze your data down to 1/3 of the JSON representation.  Saves a lot of money if you're in the cloud.
    * + Transactions don't really matter for Dota match data.
    * - Storage space of keys.  You have to store the keys in each document.  Uses extra space if your documents mostly look the same (which they probably will).
  * Postgres.  Migrated to this from Mongo.
    * + SQL, people know it!
      * You can assume most developers will be somewhat familiar/know how to do a query.  It's much harder to find people who are experts with some random NoSQL query language.
    * + Reliable, but you need to learn how it works. or you'll run into issues and have to learn how to fix them on the fly
    * - Can require a ton of free space.  MVCC means every row that gets updated needs to be fully rewritten.  The old space doesn't get reused until a VACUUM occurs.
    * - Things we learned about the hard way
      * shared_buffers.  128MB is way too low for production deployments.  Make sure you adjust this properly.
      * Postgres needs 30 bytes a row of overhead.  Keep in mind before splitting your data into lots of 2-column tables.
      * Postgres stores large field values with a technique called TOAST.  You can't have more than 4 billion of these.  Keep this in mind if you're storing a lot of JSON blobs.
      * Postgres will stop accepting writes if you do more than 2 billion transactions between vacuums.
        * Got hit with this when the DB kept restarting and autovacuum couldn't get one off.
        * We also weren't transacting the match insert and the player_match inserts, so used 10x more transactions than necessary.
* Donation model
  * Be prepared for good and bad months.
    * Typically if you release a feature, people will donate more in response, and if you don't, it will stagnate.
    * Use a subscription model if you want a steadier revenue stream.  Otherwise be prepared to pay out-of-pocket to cover bad months if you need to.
  * In our experience, around 1% of users will donate.  Might be more or less depending on who your users are.
* Caching
  * Cloudflare
    * Use them or Akamai/some other CDN.  You don't want to serving up assets like images, CSS, and JS yourself.
  * Redis
    * Redis makes a great cache for immutable data, like matches.  If someone posts a match link on Reddit and 1000 people click it, you only hit your DB once.  
* Don't try to build your own solution to everything.
  * Use Steam OAuth, don't try to roll your own auth.  You'll need account_id anyway so you can link them to the data you're getting from the Steam API.
  * Use payment processors. Stripe/Paypal will take around 10% of your donations, but it's better than trying to handle payment info yourself.
* Engage your users!
  * Twitter
    * Also serves as a nice way to announce server maintenance/outage
  * Discord
    * Dota 2 is a game, Discord is for gamers.  It's nice to be able to IM with 50 of your users on one platform.
  * Google search for your site
    * Bookmarked a query for "yasp dota", check when bored.  Quickly find mentions on Reddit, etc. to respond to users rapidly.
  * If someone is having trouble with something on your site, help them out!  They'll often find edge cases you didn't think about, and they appreciate the time you take to help them out.
* Goals
  * Raise [Bus factor](https://en.wikipedia.org/wiki/Bus_factor)
    * The minimum number of people that could be hit by a bus and bring down your project.
    * We want this number higher than 2
  * No charge
    * We don't want users who can't afford to pay a premium to have reduced functionality.
    * We might consider making "non-features" premium such as cosmetic icons, etc.
  * Open source/Open data
    * We think programming is cool and want to teach as many people who are interested how to do it/work with Dota data.
    * We also want to make all the data we have accessible and machine-readable, via data dumps and API.
    * Lets people build cool things based on our work/data.  More tools are better for the community!
