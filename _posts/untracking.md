{{{
  "title": "How I Learned to Stop Tracking Everyone and Love Our Users",
  "tags": ["tech"],
  "date": "2-24-2015",
  "author": "Howard"
}}}

It's a sad fact of life that resources are finite.

<!--more-->

When we made our first initial post on Reddit (release), we were initially overwhelmed by the response, with nearly 1000 users signing up within a day.
We had not expected this kind of load, and were only set up to handle maybe 50-100 new users.
Naturally, the following weeks consisted of a lot of work in order to scale for the Reddit masses.
Even so, we realized that many users visited, signed up, and then stopped visiting.

To help address this drop-off usage pattern and use our resources efficiently, we implemented an "untracking" system.
When a user visits, we keep track of the time.
We assume that users who have not visited in a while are not using the service, and stop tracking their matches.
This saves us the effort of parsing matches that nobody will end up looking at.

With this optimization, we are able to make use of our resources for the users who actually use them, and reduce our load accordingly.