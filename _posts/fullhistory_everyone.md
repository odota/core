{{{
  "title": "Full History For Everyone!",
  "tags": ["feature"],
  "date": "3-24-2015",
  "author": "Howard"
}}}

Thanks go to all our users, especially those who donated!

<!--more-->

YASP has grown quite a bit since we first started this project.  There are two things that we consider our "core features":
* Replay parsing.  As far as we're aware, we are the only service that offers free replay parsing of Dota 2 matches.
* Personal analytics.  We want to provide users with the tools to compute useful (and funny) stats about their own matches.

To achieve the second goal, it's essential to get full match histories for users.

Starting now, we'll be getting full match histories for all users who sign into YASP.
There may still be a delay (especially after we add lots of new users), but we'll eventually get to everyone.
We now add new matches of all users, active or not, to our database.
However, we continue to only automatically parse the matches containing an active user.
This conserves our resources by saving our parsing power for the matches that are most likely to be looked at.

We had a few reasons for making this policy change.

We found that users who signed in, went inactive, and came back were confused by gaps in their match history due to untracking.
Getting full history for all users and continuing to add their matches eliminates this problem.

One thing that this change doesn't address is the new user experience.
Since the full Dota 2 match history is on the order of 5TB (in addition to taking the better part of a year just to import), we simply can't have all of a new user's matches available to them immediately.
This means new users may still be discouraged by only seeing a few of their matches.
If you have any ideas to help us improve this, please let us know!

And finally, another thanks for our donators, who make it possible for us to add new features and expand our scope!

-Howard
