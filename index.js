/**
 * Serves as an entry point to services, based on the ROLE var
 */
var config = require('./config');
var role = config.ROLE;
console.log(role);
require("./" + role + ".js");