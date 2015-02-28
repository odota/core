{{{
  "title": "Rating Tracker is in beta!",
  "tags": ["feature","tech"],
  "date": "2-15-2015",
  "author": "Howard"
}}}

Some people have asked for a tool that keeps track of MMR.

<!--more-->

I was bored.  So I implemented it.  By adding a rating tracker to your friends list, YASP will automatically get your MMR after every ranked game.

How do we do it?  When you add one of our accounts to your friends list, the account is now able to view your MMR.
When you complete a game, YASP detects it and requests a lookup of your latest MMR.  We save this data and update your graph.