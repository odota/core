const constants = require('dotaconstants');

window.generateCharts = function generateCharts(data) {
    var color_array = [];
    for (var key in constants.player_colors) {
        color_array.push(constants.player_colors[key]);
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
        },
        valueFormat: function valueFormat (value) {
           return value + " - Level " + getLevelFromXp(value);
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
            zoom:{
                enabled: true,
                rescale: true
            },
            tooltip: {
                contents: function(d, defaultTitleFormat, defaultValueFormat, color) {
                    d.sort(function(a, b) {
                        return b.value - a.value
                    });
                    return this.getTooltipContent(d, defaultTitleFormat, chart.valueFormat || defaultValueFormat, color);
                }
            }
        });
    });
};

function getLevelFromXp(xp) {
  for (var i = 0; i < constants.xp_level.length; i++) {
    if (constants.xp_level[i] > xp) {
      return i;
    }
  }
  return constants.xp_level.length;
}