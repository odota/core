var height = 350
var difference = graphdata.difference
var gold = graphdata.gold
var xp = graphdata.xp
var lh = graphdata.lh
var charts = [
    {
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
    }
]

async.eachSeries(charts, function(chart, cb) {
    c3.generate({
        bindto: chart.bindTo,
        size: {
            height: height
        },
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
                        return moment().startOf('day').seconds(x).format("H:mm")
                    }
                },
                label: chart.xLabel
            },
            y: {
                label: chart.yLabel
            }
        }
    })
    setTimeout(cb, 50)
})