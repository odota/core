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
        cellSize: 13,
        domainGutter: 5,
        previousSelector: "#prev",
        nextSelector: "#next",
        legendHorizontalPosition: "right"
    });
    //need a param to scale the x-axis by, e.g., gpms are divided by 10 for binning, durations divided by 60
    //need a max to determine how many bins we should have
    //need a param to define the label on the x axis
    $(".histogram").on("click", function() {
        var label = $(this).attr('data-histogram');
        var counts = data[label].counts;
        //figure out the max
        var max = Math.max.apply(null, Object.keys(counts).map(function(c) {
            return Number(c);
        }));
        var bins = ~~Math.min(120, max);
        var scalef = bins/max;
        //figure out number of bins
        //figure out label
        createHistogram(counts, scalef, bins, label);
    });

    function createHistogram(counts, scalef, bins, label) {
        //creates a histogram from counts by binning values
        //temp function to generate bar charts, next version of c3 should support histograms from counts
        var arr = Array.apply(null, new Array(bins+1)).map(Number.prototype.valueOf, 0);
        Object.keys(counts).forEach(function(key) {
            var bucket = ~~(Number(key) * scalef);
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
                    label: label,
                    tick: {
                        format: function(t) {
                            return (Number(t)/scalef).toFixed(0);
                        }
                    }
                },
                y: {
                    label: 'Matches'
                }
            }
        });
    }
};