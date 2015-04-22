module.exports = function(grunt) {
    // Project configuration.
    grunt.config('env', grunt.option('env') || process.env.GRUNT_ENV || 'development');
    var isDev = grunt.config('env') !== 'production';
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        uglify: {
            options: {
                beautify: isDev,
                mangle: !isDev
            },
            build: {
                files: {
                    'public/build/yasp.min.js': ["public/js/*.js"],
                    'public/build/external.min.js': [
                        //jquery
                        'bower_components/jquery/dist/jquery.js',
                        //bootstrap
                        'bower_components/bootstrap/dist/js/bootstrap.js', 
                        //jquery datatables
                        'bower_components/datatables/media/js/jquery.dataTables.js', 
                        //jquery datatables bootstrap
                        'bower_components/datatables-bootstrap3-plugin/js/datatables-bootstrap3.js', 
                        //jquery qtip2
                        'bower_components/qtip2/jquery.qtip.js', 
                        //jquery select2
                        'bower_components/select2/select2.js', 
                        //moment
                        'bower_components/moment/moment.js', 
                        //numeral
                        'bower_components/numeral/numeral.js', 
                        //d3
                        'bower_components/d3/d3.js', 
                        //c3 (d3)
                        'bower_components/c3/c3.js', 
                        //cal-heatmap (d3)
                        'bower_components/cal-heatmap/cal-heatmap.js', 
                        //heatmap.js
                        'bower_components/heatmap.js.bower/src/heatmap.js']
                }
            }
        },
        cssmin: {
            dark: {
                files: {
                    'public/build/yasp-dark.min.css': ['public/css/flaticon.css', 'public/css/font.css', 'public/css/navbar.css', 'public/css/yasp_home.css', 'public/css/yasp.css', 'public/css/dark.css']
                }
            },
            light: {
                files: {
                    'public/build/yasp.min.css': ['public/css/flaticon.css', 'public/css/font.css', 'public/css/navbar.css', 'public/css/yasp_home.css', 'public/css/yasp.css'],
                }
            },
            external: {
                files: {
                    'public/build/external.min.css': [
                        //bootstrap
                        'bower_components/bootstrap/dist/css/bootstrap.css', 
                        //font-awesome
                        'bower_components/font-awesome/css/font-awesome.css', 
                        //jquery datatables bootstrap
                        'bower_components/datatables-bootstrap3-plugin/css/datatables-bootstrap3.css', 
                        //jquery qtip2
                        'bower_components/qtip2/jquery.qtip.css', 
                        //jquery select2
                        'bower_components/select2/select2.css', 
                        //jquery select2 bootstrap
                        'bower_components/select2/select2-bootstrap.css', 
                        //c3
                        'bower_components/c3/c3.css', 
                        //cal-heatmap
                        'bower_components/cal-heatmap/cal-heatmap.css']
                }
            }
        },
        jshint: {
            all: []
                //all: ['public/js/*.js','*.js']
        },
        watch: {
            js: {
                files: ['public/js/*.js'],
                tasks: ['uglify'],
            },
            css: {
                files: ['public/css/*.css'],
                tasks: ['cssmin'],
            }
        }
    });
    //load grunt tasks
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    // Default task(s).
    grunt.registerTask('default', ['uglify', 'cssmin', 'jshint']);
};