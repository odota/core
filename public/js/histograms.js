var c3 = require('c3');
var moment = require('moment');
module.exports = function generateHistograms(data) {
    //need a param to scale the x-axis by, e.g., gpms are divided by 10 for binning, durations divided by 60
    //need a max to determine how many bins we should have
    //need a param to define the label on the x axis
    //need a param to determine whether the time should be formatted
    $(".histogram").on("mouseover", function() {
        var label = $(this).attr('data-histogram');
        var counts = data[label].counts;
        //figure out the max
        var max = Math.max.apply(null, Object.keys(counts).map(function(c) {
            return Number(c);
        }));
        var bins = ~~Math.min(120, max);
        var scalef = bins/max;
        createHistogram(counts, scalef, bins, label);
    });
    $(".histogram").first().trigger("mouseover");

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