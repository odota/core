module.exports = function(grunt) {
  var utility = require('./utility')();
  grunt.registerTask('constants', function() {
    var done = this.async();
    utility.generateConstants(done);
  });
  grunt.registerTask('fullhistory', function() {
    var done = this.async();
    utility.getFullMatchHistory(done);
  });
  grunt.registerTask('unparsed', function() {
    var done = this.async();
    utility.unparsed(done);
  });
};
