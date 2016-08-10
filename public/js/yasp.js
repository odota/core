require('../../node_modules/font-awesome/css/font-awesome.css');
require('../../node_modules/dota2-minimap-hero-sprites/assets/stylesheets/dota2minimapheroes.css');
require('../../node_modules/bootstrap/dist/css/bootstrap.css');
require('../../node_modules/bootswatch/darkly/bootstrap.css');
require('../../node_modules/datatables-bootstrap3-plugin/media/css/datatables-bootstrap3.css');
require('../../node_modules/qtip2/dist/jquery.qtip.css');
require('../../node_modules/c3/c3.css');
require('../../node_modules/cal-heatmap/cal-heatmap.css');
require('../../node_modules/flag-icon-css/css/flag-icon.css');
require('../../node_modules/select2/dist/css/select2.css');
require('../../node_modules/select2-bootstrap-theme/dist/select2-bootstrap.css');
require('../css/flaticon.css');
require('../css/yasp.css');
require('./ga.js');
var $ = require('jquery');
window.jQuery = $;
window.$ = $;
//require('datatables.net');
//require('datatables.net-bs');
require('../../node_modules/datatables/media/js/jquery.dataTables.js');
require('../../node_modules/datatables-bootstrap3-plugin/media/js/datatables-bootstrap3.js');
require('select2');
require('qtip2');
window.c3 = require('c3');
window.CalHeatMap = require('cal-heatmap');
require('bootstrap');
require('wordcloud');
window.h337 = require('../../node_modules/heatmap.js/heatmap.js');
window.moment = require('moment');
window.numeral = require('numeral');
require("./tooltips.js");
require("./formatHtml.js");
require("./buildMap.js");
require('./createHistogram.js');
require('./createCalHeatmap.js');
require('./ratingsChart.js');
require('./generateCharts.js');
require('./util.js');
require('./resize.js');
require('./requestForm.js');
require('./queryForm.js');
window.constants = {
  player_colors:
  {
    "0": "#2E6AE6",
    "1": "#5DE6AD",
    "2": "#AD00AD",
    "3": "#DCD90A",
    "4": "#E66200",
    "128": "#E67AB0",
    "129": "#92A440",
    "130": "#5CC5E0",
    "131": "#00771F",
    "132": "#956000"
  }
};
