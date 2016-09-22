require('../store/db')('match_logs').columnInfo().asCallback((err, result) => {
  console.log(err, result);
});
