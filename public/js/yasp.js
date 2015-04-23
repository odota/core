//external
window.$ = require('jquery');
require('../../bower_components/datatables/media/js/jquery.dataTables.js');
require('../../bower_components/datatables-bootstrap3-plugin/media/css/datatables-bootstrap3.css');
require('../../bower_components/datatables-bootstrap3-plugin/media/js/datatables-bootstrap3.js');
require('../../bower_components/qtip2/jquery.qtip.css');
require('../../bower_components/qtip2/jquery.qtip.js');
require('../../bower_components/select2/select2.css');
require('../../bower_components/select2/select2-bootstrap.css');
require('../../bower_components/select2/select2.js');
require('../../bower_components/bootstrap/dist/css/bootstrap.css');
require('../../bower_components/bootstrap/dist/js/bootstrap.js');
window.moment = require('../../bower_components/moment/moment.js');
window.numeral = require('../../bower_components/numeral/numeral.js');
//window.d3 = require('../../bower_components/d3/d3.js');
require('../../bower_components/c3/c3.css');
window.c3 = require('../../bower_components/c3/c3.js');
require('../../bower_components/cal-heatmap/cal-heatmap.css');
window.CalHeatMap = require('../../bower_components/cal-heatmap/cal-heatmap.js');
window.h337 = require('../../bower_components/heatmap.js/build/heatmap.js');
require('../../bower_components/font-awesome/css/font-awesome.css');
require('../../bower_components/dota2-minimap-hero-sprites/assets/stylesheets/dota2minimapheroes.css');

//yasp
require('../css/flaticon.css');
require('../css/font.css');
require('../css/navbar.css');
require('../css/yasp_home.css');
require('../css/yasp.css');
window.pad = function pad(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }
    //adjust each x/y coordinate by the provided scale factor
    //if max is provided, use that, otherwise, use local max of data
    //shift all values by the provided shift
window.adjustHeatmapData = function adjustHeatmapData(posData, scalef, max, shift) {
    posData.forEach(function(d) {
        for (var key in d) {
            d[key] = scaleAndExtrema(d[key], scalef, max, shift);
        }
    });

    function scaleAndExtrema(points, scalef, max, shift) {
        points.forEach(function(p) {
            p.x *= scalef;
            p.y *= scalef;
            p.value += (shift || 0);
        });
        var vals = points.map(function(p) {
            return p.value;
        });
        var localMax = Math.max.apply(null, vals);
        return {
            min: 0,
            max: max || localMax,
            data: points,
        };
    }
}
window.tooltips = require('./tooltips.js');
window.formatHtml = require("./formatHtml.js");
window.createHistogram = require('./histograms.js');
window.createCalHeatmap = require('./calheatmap.js');
window.buildMap = require('./map.js');
window.playerMatches = require('./playerMatches.js');
window.playerTrendsTables = require('./playerTrendsTables.js');
window.ratingsChart = require('./ratingsChart.js');
window.statusHandler = require('./statusHandler.js');
window.generateCharts = require("./charts.js");
require('./ga.js');
//require('./timeline.js');
