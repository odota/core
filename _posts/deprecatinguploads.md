{{{
  "title": "Deprecating Uploads",
  "tags": ["tech"],
  "date": "3-3-2015",
  "author": "Howard"
}}}

With the upcoming release, we've made the decision to remove uploads.  There are several reasons for this.

<!--more-->

* Security.  While unlikely, it was possible for malicious users to manually edit .dem replay files and upload them to YASP, leading to incorrect data.
* Usage.  Only about 160 replays were ever uploaded, while there were  over 1000 requests.  Uploads were not a very used feature.
* Scalability.  Uploaded replays would have to be stored in a network-accessible location to allow parsing on a distributed architecture.  We want to minimize costs.

On the other hand, we've worked to improve the match request by ID experience, including the use of sockets for live updates!

<script src="https://gist.github.com/howardc93/52410d3c534b36ffc128.js"></script>

-Howard