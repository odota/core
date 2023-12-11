import cassandra from '../store/cassandra';
let i = 0;
cassandra
  .stream('select match_id from match_blobs', [], {
    prepare: true,
    autoPage: true,
  })
  .on('readable', function () {
    // readable is emitted as soon a row is received and parsed
    let row;
    //@ts-ignore
    while ((row = this.read())) {
      // process row
      i += 1;
      console.log(i, row.match_id.toString());
    }
  })
  .on('end', function () {
    // emitted when all rows have been retrieved and read
    console.log('finished');
    process.exit(0);
  })
  .on('error', function (e) {
    console.error(e);
    process.exit(1);
  });
