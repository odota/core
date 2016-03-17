{{{
  "title": "You want data? We got data!",
  "tags": [],
  "date": "12-20-2015",
  "author": "Nicholas"
}}}

Recently we exported <u>all</u> the parsed data we’ve collected since YASP started operating, which consists of over 3.5 million matches from January 2015 to December 2015. It’s housed in one large 100GB gzipped JSON file available <u>for anyone to torrent</u>. The magnet link for this file can be found [here](magnet:?xt=urn:btih:5c5deeb6cfe1c944044367d2e7465fd8bd2f4acf&tr=http%3A%2F%2Facademictorrents.com%2Fannounce.php&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80%2Fannounce). Additionally, a subset of  this data (the 500k most recent parsed matches) is housed in second, smaller 13GB file, which can be found [here](magnet:?xt=urn:btih:384a08fd7918cd59b23fb0c3cf3cf1aea3ea4d42&tr=http%3A%2F%2Facademictorrents.com%2Fannounce.php&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80%2Fannounce). All future uploads will be placed in this collection, hosted by [academic torrents](http://academictorrents.com/collection/yasp-data-dumps).

Our motivation for releasing this data is threefold. First, we are committed to YASP’s open-source nature, and we want to make our data as publicly available as possible. Second, with knowledge of machine learning (ML) techniques on the rise among the general population, and with easy-to-use ML tools like [Hadoop MapReduce](http://wiki.apache.org/hadoop/MapReduce) and [Apache Spark](http://spark.apache.org/) available to anyone, putting large and interesting datasets like this one in the hands of the general public opens up the possibility of anyone investigating patterns and learning models over Dota 2 match results. This data is, quite literally, a window into the collective behavior of our community. With it, who knows what fascinating trends we’ll discover about ourselves! And third, large datasets like this one are just freaking awesome. Who doesn’t want a 100GB file sitting on their desktop so they can pat themselves on the back for seeding information to the world?

If you do any interesting ML on this dataset, [let us know](https://github.com/yasp-dota/yasp/issues)! (If you’re looking for more information on the technical specifications of these files, the JSON schema overall format of the parse dumps are explained [here](https://github.com/yasp-dota/yasp/wiki/JSON-Data-Dump). And if you publish or post your findings anywhere, we’d really appreciate it if you cite YASP as your source for the data.) If you seed either of these files for any length of time, thank you! And as always, if you’d like to contribute to the YASP codebase, never hesitate to check out our [github](https://github.com/yasp-dota/yasp).

Happy holidays, everyone :)

*Update 2016-03-17*: [@felipehoffa](https://twitter.com/felipehoffa) loaded the 3.5 million matches dump into Google BigQuery. Learn more about [querying YASP on BigQuery](https://github.com/yasp-dota/yasp/issues/924) on our github.
