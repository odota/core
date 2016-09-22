let max = 0;
db.matches.find().forEach((obj) => {
  const curr = Object.bsonsize(obj);
  if (curr > 150000) {
    print(obj.match_id, curr);
  }
  if (curr > max) {
    max = curr;
  }
});
print(max);
