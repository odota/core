var c3 = require('c3');
var async = require('async');
var moment = require('moment');

module.exports = function generateCharts(data) {
    $(document).on('ready', function() {
        c3.generate({
            bindto: "#chart-gold-breakdown",
            data: {
                columns: data.goldCols,
                type: 'bar',
                order: 'desc',
                groups: [
                    data.gold_reasons
                ]
            },
            bar: {
                width: {
                    ratio: 0.9
                }
            },
            axis: {
                x: {
                    type: "category",
                    categories: data.cats
                }
            }
        });
        var difference = data.difference;
        var gold = data.gold;
        var xp = data.xp;
        var lh = data.lh;
        var charts = [{
            bindTo: "#chart-diff",
            columns: difference,
            x: 'time',
            type: "area-spline",
            xLabel: 'Game Time (minutes)',
            yLabel: 'Radiant Advantage'
        }, {
            bindTo: "#chart-gold",
            columns: gold,
            x: 'time',
            type: "spline",
            xLabel: 'Game Time (minutes)',
            yLabel: 'Gold'
        }, {
            bindTo: "#chart-xp",
            columns: xp,
            x: 'time',
            type: "spline",
            xLabel: 'Game Time (minutes)',
            yLabel: 'XP'
        }, {
            bindTo: "#chart-lh",
            columns: lh,
            x: 'time',
            type: "spline",
            xLabel: 'Game Time (minutes)',
            yLabel: 'LH'
        }];

        async.eachSeries(charts, function(chart, cb) {
            c3.generate({
                bindto: chart.bindTo,
                data: {
                    x: chart.x,
                    columns: chart.columns,
                    type: chart.type
                },
                axis: {
                    x: {
                        type: 'timeseries',
                        tick: {
                            format: function(x) {
                                return moment().startOf('day').seconds(x).format("H:mm");
                            }
                        },
                        label: chart.xLabel
                    },
                    y: {
                        label: chart.yLabel
                    }
                }
            });
            setTimeout(cb, 50);
        });
    });
}