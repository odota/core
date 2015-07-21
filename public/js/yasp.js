// external css
require('../../node_modules/c3/c3.css');
require('../../node_modules/cal-heatmap/cal-heatmap.css');
require('../../node_modules/bootstrap/dist/css/bootstrap.css');
require('../../node_modules/select2/dist/css/select2.css');
require('../../node_modules/select2-bootstrap-theme/dist/select2-bootstrap.css');
require('../../node_modules/qTip2/dist/jquery.qtip.css');
require('../../node_modules/font-awesome/css/font-awesome.css');
require('../../node_modules/dota2-minimap-hero-sprites/assets/stylesheets/dota2minimapheroes.css');
require('../../node_modules/datatables-bootstrap3-plugin/media/css/datatables-bootstrap3.css');
// external js libs
window.$ = require('jquery');
require('../../node_modules/datatables/media/js/jquery.dataTables.js');
require('../../node_modules/datatables-bootstrap3-plugin/media/js/datatables-bootstrap3.js');
require('../../node_modules/qTip2/dist/jquery.qtip.js');
require('../../node_modules/select2/dist/js/select2.full.js');
// require('../../node_modules/webcomponents.js/webcomponents.js');
require('bootstrap');
require('wordcloud');
window.c3 = require('c3');
window.CalHeatMap = require('cal-heatmap');
window.h337 = require('../../node_modules/heatmap.js/build/heatmap.js');
window.moment = require('moment');
window.numeral = require('numeral');
// yasp utility functions
window.pad = function pad(n, width, z) {
    const zz = z || '0';
    const nn = String(n);
    return nn.length >= width ? nn : new Array(width - nn.length + 1).join(zz) + nn;
};
// adjust each x/y coordinate by the provided scale factor
// if max is provided, use that, otherwise, use local max of data
// shift all values by the provided shift
window.adjustHeatmapData = function adjustHeatmapData(posData, scalef, max, shift) {
    posData.forEach(function(d) {
        for (let key in d) {
            d[key] = scaleAndExtrema(d[key], scalef, max, shift);
        }
    });

    function scaleAndExtrema(points, scalef, max, shift) {
        points.forEach(function(p) {
            p.x *= scalef;
            p.y *= scalef;
            p.value += (shift || 0);
        });
        const vals = points.map((p) => p.value);
        const localMax = Math.max.apply(null, vals);
        return {
            min: 0,
            max: max || localMax,
            data: points
        };
    }
};

window.format = function format(input) {
    const num = ~~(Number(input));
    if (num === 0 || isNaN(num)) {
        return '-';
    }
    return (Math.abs(num) < 1000) ? num : window.numeral(num).format('0.0a');
};

window.formatSeconds = function formatSeconds(input) {
    const absTime = Math.abs(input);
    const minutes = ~~(absTime / 60);
    const seconds = window.pad(~~(absTime % 60), 2);
    const time = ((input < 0) ? '-' : '') + minutes + ':' + seconds;
    return time;
};

window.tooltips = require('./tooltips.js');
window.formatHtml = require('./formatHtml.js');
window.createHistogram = require('./histograms.js');
window.createCalHeatmap = require('./calheatmap.js');
window.buildMap = require('./buildMap.js');
window.playerMatches = require('./playerMatches.js');
window.drawHeroes = require('./drawHeroes.js');
window.drawTeammates = require('./drawTeammates.js');
window.proMatches = require('./proMatches.js');
window.ratingsChart = require('./ratingsChart.js');
window.generateCharts = require('./charts.js');
window.timeline = require('./timeline.js');
require('./ga.js');
