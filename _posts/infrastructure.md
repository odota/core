{{{ "title": "Infrastructure/Stack", "tags": ["tech"], "date": "4-29-2015", "author": "Howard" }}}

Originally posted on Reddit, with some minor updates.

<!--more-->

Front-end: 
A Node.js/Express application, templated with Jade.
We use various open-source JavaScript libraries such as c3 and datatables.

Back-end: 
We store all our data in MongoDB. 
It works pretty well, although we're looking into ways to improve performance (particularly on player pages). 
We use Redis for certain specific tasks (job queue, caching matches, etc.)

Parsing: 
We wrote our parser in Java, using the clarity library by spheenik. 
Thanks to his hard work, it's very fast, and we're usually able to complete a parse job end-to-end in <15 sec.

Infrastructure:
We currently run on two primary nodes, affectionately named:
yasp-core: Serves up the site, takes care of database operations, runs background worker tasks.
parser1: Parses replays and emits a stream of JSON events over HTTP.  A 4-core parsing node can handle about 10000 replays a day.

We also employ a host of smaller non-dedicated VMs for retrieving replay data and proxying requests.
