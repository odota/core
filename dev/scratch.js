require('../store/db')('match_logs').columnInfo().asCallback(function(err, result)
{
    console.log(err, result);
});
