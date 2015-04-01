{{{ "title": "v2.0.0", "tags": ["release"], "date": "4-1-2015", "author": "Howard and Albert" }}}

YASP is jumping a version number to v2.0.0!

<!--more-->

### Features

* Manual name update. Relogging now updates your name from the Steam API.
* Advanced Querying. More powerful options for aggregating and filtering matches.
  * This feature has long been requested. We hope you like it!
* 322 Level. More info <a href="/post/throws" target="_blank">here</a>!

### UI
* Defaulted dark theme
* Link to steam profile if available on player pages

### Bugfixes
* Patched an issue with graphs/lane efficiency due to interval checks before time=0
* Fixed display issues and mobile issues on the front page

### Performance/backend
* Parser stream now injects progress, error, exit events into the parser event log
* Improved full history processing algorithm
* Using protobufjs for reduced build times
* Enabled parsing on distributed hosts.  If you've got a server we could use, let us know!

Like what we're doing? Please consider some [cheese](http://yasp.co/carry). While we're doing everything we can to cut costs, and take no profit for ourselves, hosting isn't cheap!

Can't afford any cheese? That's okay! Tell your friends about YASP :)

Thank you, thank you, thank you for all your support! It's what keeps us going.

-Howard and Albert (The YASP Team!)