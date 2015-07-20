module.exports = function generateCharts(data) {
    const colorArray =
        Object.keys(constants.player_colors).map((key) => constants.player_colors[key]);

    const { difference, gold, xp, lh } = data;
    const charts = [
        {
            bindTo: '#chart-diff',
            columns: difference,
            x: 'time',
            type: 'area-spline',
            xLabel: 'Game Time (minutes)',
            yLabel: 'Radiant Advantage'
        },
        {
            bindTo: '#chart-gold',
            columns: gold,
            x: 'time',
            type: 'spline',
            xLabel: 'Game Time (minutes)',
            yLabel: 'Gold',
            color: {
                pattern: colorArray
            }
        },
        {
            bindTo: '#chart-xp',
            columns: xp,
            x: 'time',
            type: 'spline',
            xLabel: 'Game Time (minutes)',
            yLabel: 'XP',
            color: {
                pattern: colorArray
            }
        },
        {
            bindTo: '#chart-lh',
            columns: lh,
            x: 'time',
            type: 'spline',
            xLabel: 'Game Time (minutes)',
            yLabel: 'LH',
            color: {
                pattern: colorArray
            }
        }
    ];
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
                            return moment().startOf('day').seconds(x).format('H:mm');
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
                    d.sort((a, b) => b.value - a.value);
                    return this.getTooltipContent(d, defaultTitleFormat, defaultValueFormat, color);
                }
            }
        });
    });
};
