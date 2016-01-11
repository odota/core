{{{
  "title": "Ability Upgrade Removal",
  "date": "1-11-2016",
  "author": "Albert"
}}}

### The Change

We're always trying to operate YASP as financially efficient as possible, and today, we're making a change to ability upgrades
to do just that.

**From now on, ability upgrades for new matches will be viewable for 24 hours after we add the match to our database. Afterwards,
we'll delete the data. We're also removing all ability upgrade data from old matches.**

Want to see the ability upgrades for a match? You can still use the [request](/request) form to get the data added back
for another 24 hours.

### Why?

Database size is by far the largest operating cost for us, and it's an ever increasing cost. As more matches get added,
we have to spend more on hard drive space each month.

We currently have 100 million matches in our database. Each match's ability upgrade information takes 9 KB of data.
In our opinion, this isn't entirely useful information a few hours after a match and especially between patches when
heros are reworked. We're also not currently doing any aggregations over ability data (which would be very expensive).
By cutting these from our database, we're saving a huge chunk of space.

### And that means...

We're going to use this space to improve the Y ASP experience. We're now going to go back and add all the Dota 2 matches ever played.
(That is, retrievable from the WebAPI.)

New users to YASP have always wondered why their matches aren't on YASP. We've long used a "full history" service to get a player's
matches after they signed in for the first time, but this would take days or weeks to complete. Now, users should have a much
better first experience with YASP.

Happy Dota!