var c3 = require('c3');
var CalHeatMap = require('cal-heatmap');
var moment = require('moment');
var async = require('async');
module.exports = function generateHistograms(data) {
    async.series([
            function(cb) {
            var cal = new CalHeatMap();
            cal.init({
                start: new Date(moment().subtract(1, 'year')),
                range: 13,
                domain: "month",
                subDomain: "day",
                data: data.calheatmap,
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
            setTimeout(cb, 50);
            },
            function(cb) {
            c3.generate({
                bindto: "#chart-duration",
                data: {
                    columns: [
                            ['Matches'].concat(data.durations)
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
                        label: 'Minutes'
                    },
                    y: {
                        label: 'Matches'
                    }
                }
            });
            setTimeout(cb, 50);
            },
            function(cb) {
            c3.generate({
                bindto: "#chart-gpms",
                data: {
                    columns: [
                            ['Matches'].concat(data.gpms)
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
                        label: 'GPM',
                        tick: {
                            format: function(x) {
                                return String(x * 10);
                            }
                        }
                    },
                    y: {
                        label: 'Matches'
                    }
                }
            });
            setTimeout(cb, 50);
            }
        ]);
};