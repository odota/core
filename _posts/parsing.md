{{{
  "title": "Replay parsing",
  "tags": ["tech"],
  "category": "release",
  "date": "2-8-2015",
  "author": "Howard"
}}}

Replay parsing is a tricky problem.  Thanks go to the author of clarity for helping us out.

<!--more-->

One thing that we originally improved on was the idea of using indices to get to particular bits of entity state.
The more readable way of doing this is to get the property using a string name, but spheenik suggested that we instead obtain the index of this property, then use the index to repeatedly get at that state for multiple units.

It turned out that this didn't improve our performance very much, but it avoided us having to do arcane string lookups ending with "0001", etc.