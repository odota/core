{{{
  "title": "Feature: Automatic individual match analysis",
  "date": "1-1-2016",
  "author": "Howard"
}}}

We're constantly trying to think of things to do with the data we get from replays.  One idea we've come up with is trying to offer advice to players based on their statistical performance in a match.

Each match now has a new tab labeled "Analysis".  Each player is graded (A-F) on a range of categories, with details on areas for improvement identified.

The grading system is built to be easily extensible if we want to add more categories to check or adjust an existing check.
Each category defines a scoring function that computes a score based on the match and player, and a threshold score (A-standard).
Meeting the A-standard results in a grade of "A", with lower percentages scoring lower grades.

We hope this new feature will help you improve your gameplay!