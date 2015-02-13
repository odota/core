var $ = jQuery = require('jquery');
$.qtip = require('qtip2');
//var dataTable = require('datatables');
//do on every page
$(document).ready(function() {
    require('./tooltips')();
    require('./formatHtml')();
});
//functions to call on demand
global.generateCharts = require('./charts');
global.matchTable = require('./matchTables');
global.playerTables = require('./playerTables');
global.buildMap = require('./map');
global.generateHistograms = require('./histograms');
global.$ = $;
global.statusHandler = require('./statusHandler');