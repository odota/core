{{{
  "title": "A blog for YASP",
  "tags": ["yasp", "tech"],
  "date": "2-23-2015",
  "author": "Howard"
}}}

One of the features that Albert's wanted for a while and has been kicking around for months is a blog.

<!--more-->

The idea is to be able to inform users about the goings-on of YASP in longer-form posts than is possible through Twitter or a banner message.
But how would we implement it?

Albert decided to try out the Poet library for Node.  This is what we're working with now, in which we write our blog posts in Markdown, commit them to the repository, and see them live in production on the next deployment.

So far, it seems to be working.