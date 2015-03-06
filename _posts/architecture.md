{{{
  "title": "The YASP Architecture",
  "tags": ["tech"],
  "date": "3-5-2015",
  "author": "Howard"
}}}

In this post I'll talk a little bit about the infrastructure behind YASP. I may expand it if I have more time.

<!--more-->

YASP began as a fork of RJacksonm1's matchurls, which was an example of programmatically obtaining replay salts.
The salts are required to download the replays, as Valve removed them from the WebAPI several years ago.

However, we had to solve a few problems in order to scale:
* Account limitation.  Each Steam account is limited to 100 replay downloads per 24 hours.
* IP limitation.  Each IP address is limited to 500 replay downloads per 24 hours.

Thus, YASP is built with the following modular components:
* Web, in charge of serving the YASP site
* Worker, in charge of accessing the Steam API and running background tasks such as full history and updating names and detecting currently tracked users.
* Parser, in charge of downloading and parsing replays
* Retriever, in charge of interfacing with the Steam GC to get replay salts and player MMRs

We currently run web, worker, and parser on a single box we call YASP Core.
However, the retrievers must be distributed on different hosts due to the IP limitation.

Scaling:
* Web: We could deploy additional instances of this, and put them behind a load balancer
* Worker: This isn't as easily parallelizable, since the sequential API is difficult to use in parallel (we don't know what the next set of sequence numbers should be until we finish processing the current batch)
* Parser: We've architectured the parser (in v1.5 anyway) so that we can easily deploy additional parsers to scale with load.
* Retriever: We simply deploy more instances of this and add more accounts in order to be able to handle more replays per day.

Pipeline:
* A game appears in the Steam sequential matches API
* We find that it contains a tracked player
* We send a request to retriever to get the replay salt
* We insert the match into MongoDB and request a parse on it
* We download and parse the match (streaming, since we don't want to hold on to replays)
* We save the parsed data to MongoDB

-Howard
