{{{
  "title": "Update on Picks",
  "date": "3-2-2016",
  "author": "HowardC"
}}}

I've removed Tetrads and Pentads from the Picks data.

Two reasons:

1) Memory. We've had issues with memory on previous features. Some contributors lobbied to collect data for groups of heroes on a team, feeling that the data would be interesting. That was a mistake. 
The number of combinations of 4/5 heroes is large (110c4 and 110c5 respectively), and we have to keep a count of each unique one we see.  Unavailability caused by OOM errors is an ass, and we won't be letting it kill PostgreSQL again.

2) As long as I'm talking about reasons to remove them, the top picks were also dominated by item farming bots.  They will be reported, and we hope they get banned before they take over the entire game.

As always, I can be reached at howardc93@gmail.com.

Howard
