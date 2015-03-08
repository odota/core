var $ = jQuery = require('jquery');
var utility = require('./utility');
var formatSeconds = utility.formatSeconds;
var format = utility.format;
var moment = require('moment');
module.exports = function processHtml() {
    $('table.summable').each(function(i, table) {
        //iterate through rows
        var sums = {
            Radiant: {},
            Dire: {}
        };
        var negatives = {}
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
                negatives[j] = cell.hasClass('negative');
                var content = cell.clone() //clone the element
                    .children() //select all the children
                    .remove() //remove all the children
                    .end() //again go back to selected element
                    .text();
                //todo support stuff like % symbols
                //todo invert "winner" if a negative category
                target[j] += Number(content) || 0;
            });
        });
        //console.log(sums, negatives)
        //add sums to table
        var tfoot = $("<tfoot>");
        for (var key in sums) {
            var tr = $("<tr>");
            var sum = sums[key];
            sum["0"] = key;
            for (var index in sum) {
                var td = $("<td>");
                if (index !== "0") {
                    td.addClass('format');
                }
                td.text(sum[index]);
                //mark if this team  "won" this category
                var other = (key === "Radiant") ? "Dire" : "Radiant";
                var greaterThan = sum[index] > sums[other][index];
                //invert if a negative category
                greaterThan = negatives[index] ? sum[index] < sums[other][index] : greaterThan;
                if (greaterThan) {
                    td.addClass((key === "Radiant") ? 'success': 'danger');
                }
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
        $(this).text(formatSeconds($(this).attr('data-format-seconds')));
    });
};