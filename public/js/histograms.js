var c3 = require('c3');
var CalHeatMap = require('cal-heatmap');
var moment = require('moment');
module.exports = function generateHistograms(data) {
    var cal = new CalHeatMap();
    cal.init({
        start: new Date(moment().subtract(1, 'year')),
        range: 13,
        domain: "month",
        subDomain: "day",
        data: data.start_time.counts,
        verticalOrientation: true,
        label: {
            position: "left"
        },
        colLimit: 31,
        tooltip: true,
        legend: [1, 2, 3, 4],
        highlight: new Date(),
        itemName: ["match", "matches"],
        subDomainTextFormat: function(date, value) {
            return value;
        },
        cellSize: 12,
        domainGutter: 5,
        previousSelector: "#prev",
        nextSelector: "#next",
        legendHorizontalPosition: "right"
    });
    //todo add mouseover listener to generate histogram on demand
    //need a param to scale the x-axis by, e.g., gpms are divided by 10 for binning, durations divided by 60
    //need a max to determine how many bins we should have
    //need a param to define the label on the x axis
    $(".histogram").on("click", function() {
        createHistogram(data[$(this).attr('data-histogram')].counts, 1 / 60, 120);
    });

    function createHistogram(counts, scalef, max) {
        //creates a histogram from counts by binning values
        //temp function to generate bar charts, next version of c3 should support histograms from counts
        var arr = Array.apply(null, new Array(max)).map(Number.prototype.valueOf, 0);
        Object.keys(counts).forEach(function(key) {
            var bucket = Math.round(Number(key) * scalef) % max;
            arr[bucket] += counts[key];
        });
        c3.generate({
            bindto: "#chart-histogram",
            data: {
                columns: [
                            ['Matches'].concat(arr)
                        ],
                type: 'bar'
            },
            bar: {
                width: {
                    ratio: 0.8
                }
            },
            axis: {
                x: {
                    label: 'X'
                },
                y: {
                    label: 'Matches'
                }
            }
        });
    }
};