var height = 350
var goldDifference = ['Gold']
var xpDifference = ['XP']
var time = ["time"].concat(match.parsed_data.times)
var gold = [time]
var xp = [time]
var lh = [time]
var groups = [
    []
]
for(var i = 0; i < match.parsed_data.times.length; i++) {
    var goldtotal = 0
    var xptotal = 0
    var absGoldTotal = 0
    var absXpTotal = 0
    match.parsed_data.players.forEach(function(elem, j) {
        absGoldTotal +=elem.gold[i]
        absXpTotal +=elem.xp[i]
        if(j < 5) {
            goldtotal += elem.gold[i]
            xptotal += elem.xp[i]
        } else {
            xptotal -= elem.xp[i]
            goldtotal -= elem.gold[i]
        }
    })
    goldDifference.push(goldtotal)
    xpDifference.push(xptotal)
    /*
    match.parsed_data.players.forEach(function(elem, j) {
        elem.gold[i]=elem.gold[i]/(absGoldTotal)
        elem.xp[i]=elem.xp[i]/(absXpTotal)
    })
    */
}
match.parsed_data.players.forEach(function(elem, i) {
    var hero = constants.heroes[match.players[i].hero_id].localized_name
    groups[0].push(hero)
    elem.gold = [hero].concat(elem.gold)
    gold.push(elem.gold)
    elem.xp = [hero].concat(elem.xp)
    xp.push(elem.xp)
    elem.lh = [hero].concat(elem.lh)
    lh.push(elem.lh)
})


charts = [
    {
        bindTo: "#chart-diff",
        columns: [time, goldDifference, xpDifference],
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