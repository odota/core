module.exports = function(grunt) {
    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            build: {
                files: {
                    'public/build/yasp.min.js': ["public/js/*.js"]
                }
            }
        },
        cssmin: {
            build: {
                files: [{
                    'public/build/yasp.min.css': ['public/css/*.css']
    }]
            }
        },
        jshint: {
            all: []
            //all: ['public/js/*.js','*.js']
        }
    });
    // Load the plugin that provides the "uglify" task.
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    // Default task(s).
    grunt.registerTask('default', ['uglify', 'cssmin', 'jshint']);
};