module.exports = function(grunt) {
  var tasks = require('./tasks');
  grunt.registerTask('constants', function() {
    var done = this.async();
    tasks.generateConstants(done);
  });
  grunt.registerTask('fullhistory', function() {
    var done = this.async();
    tasks.getFullMatchHistory(done);
  });
  grunt.registerTask('unparsed', function() {
    var done = this.async();
    tasks.unparsed(done);
  });
  grunt.registerTask('unnamed', function() {
    var done = this.async();
    tasks.updateSummaries(done);
  });
};
