var args = process.argv.slice(2);
require('./tasks/' + args[0])(function(err, res) {
    if (err){
        console.log(err);
    }
    process.exit(Number(err));
});