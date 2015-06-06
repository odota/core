module.exports = function generateCharts(data) {
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
    var color_array = [];
    for (var key in player_colors) {
        color_array.push(player_colors[key]);
    }
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
        yLabel: 'Gold',
        color: {
            pattern: color_array
        }
        }, {
        bindTo: "#chart-xp",
        columns: xp,
        x: 'time',
        type: "spline",
        xLabel: 'Game Time (minutes)',
        yLabel: 'XP',
        color: {
            pattern: color_array
        }
        }, {
        bindTo: "#chart-lh",
        columns: lh,
        x: 'time',
        type: "spline",
        xLabel: 'Game Time (minutes)',
        yLabel: 'LH',
        color: {
            pattern: color_array
        }
        }];
    charts.forEach(function(chart) {
        c3.generate({
            bindto: chart.bindTo,
            data: {
                x: chart.x,
                columns: chart.columns,
                type: chart.type
            },
            color: chart.color,
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
            },
            tooltip: {
                contents: function(d, defaultTitleFormat, defaultValueFormat, color) {
                    d.sort(function(a, b) {
                        return b.value - a.value
                    });
                    return this.getTooltipContent(d, defaultTitleFormat, defaultValueFormat, color);
                }
            }
        });
    });
};