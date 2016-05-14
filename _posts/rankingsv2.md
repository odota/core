{{{
  "title": "Rankings Algorithm Update",
  "date": "5-13-2016",
  "author": "Howard"
}}}

After evaluating feedback from the initial release of rankings I've updated the ranking algorithm to address some of the feedback.

Changes:
 * MMR is now weighted more heavily in the ranking calculation
 * All matches (not just ranked) are now considered for ranking
 * Points scored per win are weighted by average visible MMR in the match

Notes:
 * The existing rankings have been reset, so everyone is starting over with a clean plate
 * Rankings still reset quarterly, so the current round of rankings will reset again on June 1.  Consider the next two weeks a sort of "trial run" of the new system.

Full details of the ranking code are available on [GitHub](https://github.com/yasp-dota/yasp), and as always we welcome feedback and ideas!