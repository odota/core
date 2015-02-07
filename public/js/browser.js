var moment = require('moment');
var $ = jQuery = require('jquery');
var qtip = require('qtip2');
$.qtip = qtip;
//var dataTable = require('datatables');
var tooltips = require('./tooltips');
var utility = require('./utility');
var format = utility.format;
var formatSeconds = utility.formatSeconds;
$(document).ready(function() {
    process();
    listeners();
    tooltips();
});
//functions to call on demand
global.generateCharts = require('./charts');
global.matchTable = require('./matchTables');
global.playerTables = require('./playerTables');
global.buildMap = require('./map');
global.generateHistograms = require('./histograms');
global.$ = $;
global.statusHandler = function() {
    var socket = io.connect();
    var buffers = {
        last_added: [],
        last_parsed: []
    };
    socket.on('stats', function(data) {
        console.log(data);
        for (var prop in data.stats) {
            if (typeof data.stats[prop] === "object") {
                if (!buffers[prop].length || data.stats[prop].match_id !== buffers[prop][0].match_id) {
                    data.stats[prop].jq = $(
                        "<tr>" +
                        "<td>" + data.stats[prop].match_id + "</td>" +
                        "<td>" + moment.unix(data.stats[prop].start_time + data.stats[prop].duration).fromNow() + "</td>" +
                        "</tr>");
                    buffers[prop].unshift(data.stats[prop]);
                    data.stats[prop].jq.hide().prependTo($("#" + prop + " tbody")).show('slow');
                }
                if (buffers[prop].length>10){
                    var pop = buffers[prop].pop();
                    pop.jq.hide('slow', function(){ pop.jq.remove(); });
                }
            }
            else {
                $("#" + prop).html(data.stats[prop]);
            }
        }
    });
}

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