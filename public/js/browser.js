var moment = require('moment');
var $ = jQuery = require('jquery');
var qtip = require('qtip2');
$.qtip = qtip;
//var dataTable = DataTable = require('datatables');
//$.dataTable = dataTable;
var tooltips = require('./tooltips');
var utility = require('./utility');
var format = utility.format;
var formatSeconds = utility.formatSeconds;
//functions to call on demand
global.generateCharts = require('./charts');
global.matchTable = require('./matchTables');
global.playerTables = require('./playerTables');
global.buildMap = require('./map');
global.generateHistograms = require('./histograms');
global.$ = $;
//run on each page
$(document).ready(function() {
    process();
    listeners();
    tooltips();
});

function process() {
    $('table.summable').each(function(i, table) {
        //iterate through rows
        var sums = {
            Radiant: {},
            Dire: {}
        };
        var tbody = $(table).find('tbody');
        tbody.children().each(function(i, row) {
            row = $(row);
            var target = (row.hasClass('success')) ? sums.Radiant : sums.Dire;
            //iterate through cells
            row.children().each(function(j, cell) {
                cell = $(cell);
                if (!target[j]) {
                    target[j] = 0;
                }
                var content = cell.clone() //clone the element
                    .children() //select all the children
                    .remove() //remove all the children
                    .end() //again go back to selected element
                    .text();
                target[j] += Number(content) || 0;
            });
        });
        //add sums to table
        var tfoot = $("<tfoot>");
        for (var key in sums) {
            var tr = $("<tr>");
            var sum = sums[key];
            sum["0"] = key;
            for (var index in sum) {
                var td = $("<td>");
                if (index != "0") {
                    td.addClass('format');
                }
                td.text(sum[index]);
                tr.append(td);
            }
            tfoot.append(tr);
        }
        $(table).append(tfoot);
    });
    $('.format').each(function() {
        $(this).text(format($(this).text()));
    });
    $('.fromNow').each(function() {
        $(this).text(moment.unix($(this).text()).fromNow());
    });
    $('.format-seconds').each(function() {
        $(this).text(formatSeconds($(this).text()));
    });
}

function listeners() {
    var $dark = $("#dark");
    $dark.change(function() {
        console.log($dark.is(":checked"));
        $.post(
            "/preferences", {
                dark: $dark.is(":checked")
            },
            function(data) {
                if (data.sync) {
                    location.reload(true);
                }
                else {
                    $(".page-header").after("<div role='alert' class='sync alert alert-warning'>Failed to update preferences. Try again later.</div>");
                }
                $(".sync").fadeOut(3000);
            });
    });
}