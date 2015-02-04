var c3 = require('c3');
var CalHeatMap = require('cal-heatmap');
var moment = require('moment');

module.exports = function generateHistograms(data) {
    $(document).on('ready', function() {
        console.log(data);
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
        var cal = new CalHeatMap();
        cal.init({
            start: new Date(moment().subtract(1, 'year')),
            range: 13,
            domain: "month",
            subDomain: "day",
            data: data.calheatmap,
            tooltip: true,
            legend: [1, 2, 3, 4],
            highlight: new Date(),
            itemName: ["match", "matches"],
            subDomainTextFormat: function(date, value) {
                return value;
            },
            cellSize: 15,
            previousSelector: "#prev",
            nextSelector: "#next"
        });
    });
};