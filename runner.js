var dotenv = require('dotenv');
dotenv.load();
var args = process.argv.slice(2);
require('./tasks/' + args[0])(function(err, res) {
    process.exit(err);
});