var args = process.argv.slice(2);
require('./tasks/' + args[0])(function(err, res) {
    process.exit(Number(err));
});