{{{ "title": "v2.0.0", "tags": ["release"], "date": "4-1-2015", "author": "Howard" }}}

YASP is jumping a version number, releasing v2.0.0!

<!--more-->

Features
--------
* Manual name update. Relogging now updates your name from the Steam API.
* Advanced Querying. More powerful options for aggregating and filtering matches.

UI
--
* Defaulted dark theme

Bugfixes
--------
* Patched an issue with graphs/lane efficiency due to interval checks before time=0

Performance/backend
-------------------
* Parser stream now injects progress, error, exit events into the parser event log
* Improved full history processing algorithm
* Using protobufjs for reduced build times
* Enabled parsing on distributed hosts.  If you've got a server we could use, let us know!