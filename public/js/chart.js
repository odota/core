var goldDifference = ['Difference - Radiant minus Dire']
for (var i = 0; i < time.length; i++) {
    var total = 0;
    gold.forEach(function(elem, j) {
        if (j < 5) total += elem[i]
        else total -= elem[i]
    })

    goldDifference.push(total)
}

var xpDifference = ['Difference - Radiant minus Dire']
for (var i = 0; i < time.length; i++) {
    var total = 0;
    xp.forEach(function(elem, j) {
        if (j < 5) total += elem[i]
        else total -= elem[i]
    })

    xpDifference.push(total)
}

lh.forEach(function(elem, i){
	lh[i] = [names[i]].concat(elem)
})

denies.forEach(function(elem, i){
	denies[i] = [names[i]].concat(elem)
})

gold.forEach(function(elem, i){
	gold[i] = [names[i]].concat(elem)
})

xp.forEach(function(elem, i){
	xp[i] = [names[i]].concat(elem)
})

levels.forEach(function(elem, i){
	levels[i] = [names[i]].concat(elem)
})

time = ["time"].concat(time)
lh.push(time)
denies.push(time)
gold.push(time)
xp.push(time)
levels.push(time)
goldDifference = [time, goldDifference]
xpDifference = [time, xpDifference]

console.log(goldDifference)

var lh = c3.generate({
    bindto: "#chart-lh",
    size: {
        height: 500
    },
    data: {
        x: 'time',
        columns: lh
    },
    axis: {
        x: {
            type: 'timeseries',
            tick: {
            	format: function(x) { return moment().startOf('day').seconds(x).format("H:mm")}
            },
            label: 'Game Time (minutes)'
        },
        y: {
            label: 'Last Hits'
        }
    },
    zoom: {
        enabled: true
    }
})

var d = c3.generate({
    bindto: "#chart-denies",
    size: {
        height: 500
    },
    data: {
        x: 'time',
        columns: denies
    },
    axis: {
        x: {
            type: 'timeseries',
            tick: {
            	format: function(x) { return moment().startOf('day').seconds(x).format("H:mm")}
            },
            label: 'Game Time (minutes)'
        },
        y: {
            label: 'Denies'
        }
    },
    zoom: {
        enabled: true
    }
})

var g = c3.generate({
    bindto: "#chart-gold",
    size: {
        height: 500
    },
    data: {
        x: 'time',
        columns: gold
    },
    axis: {
        x: {
            type: 'timeseries',
            tick: {
            	format: function(x) { return moment().startOf('day').seconds(x).format("H:mm")}
            },
            label: 'Game Time (minutes)'
        },
        y: {
            label: 'Gold'
        }
    },
    zoom: {
        enabled: true
    }
})

var x = c3.generate({
    bindto: "#chart-xp",
    size: {
        height: 500
    },
    data: {
        x: 'time',
        columns: xp
    },
    axis: {
        x: {
            type: 'timeseries',
            tick: {
            	format: function(x) { return moment().startOf('day').seconds(x).format("H:mm")}
            },
            label: 'Game Time (minutes)'
        },
        y: {
            label: 'XP'
        }
    },
    zoom: {
        enabled: true
    }
})

var l = c3.generate({
    bindto: "#chart-levels",
    size: {
        height: 500
    },
    data: {
        x: 'time',
        columns: levels
    },
    axis: {
        x: {
            type: 'timeseries',
            tick: {
            	format: function(x) { return moment().startOf('day').seconds(x).format("H:mm")}
            },
            label: 'Game Time (minutes)'
        },
        y: {
            label: 'Level'
        }
    },
    zoom: {
        enabled: true
    }
})

function reloadGold() {
    g.load({
        columns: gold,
        unload: ["Difference - Radiant minus Dire"]
    }) 
    
    $('#gold').one("click", unloadGold)
}

function unloadGold() {
    g.load({
        columns: goldDifference,
        unload: names
    })
    
    $('#gold').one("click", reloadGold)
}

$('#gold').one("click", unloadGold)

function reloadXp() {
    x.load({
        columns: xp,
        unload: ["Difference - Radiant minus Dire"]
    }) 
    
    $('#exp').one("click", unloadXp)
}

function unloadXp() {
    x.load({
        columns: xpDifference,
        unload: names
    })
    
    $('#exp').one("click", reloadXp)
}

$('#exp').one("click", unloadXp)