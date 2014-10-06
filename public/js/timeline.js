function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function formatSeconds(input) {
    var absTime = Math.abs(input)
    var minutes = ~~ (absTime / 60)
    var seconds = pad(absTime % 60, 2)
    var time = ((input < 0) ? "-" : "")
    time += minutes + ":" + seconds
    return time
}

function momentTime(input){
    return moment().startOf('day').seconds(input)
}
match.parsed_data.players.forEach(function(player, ind) {
    var items = new vis.DataSet();
    var heroes = 0
    for(var i = 0; i < player.timeline.length; i++) {
        var event = player.timeline[i]
        var bar = {}
        var time = formatSeconds(event.time)
        time = "<span style='font-size:10px;'>" + time + "<span>"
        bar.start = momentTime(event.time)
        if(event.type == "itembuys") {
            var img = constants.items[event.key].img
            bar.content = "<img src='" + img + "' width=30 />" + time
            bar.group = 1
            items.add(bar)
        }
        /*
        if(event.type == "gold_log") {
            bar.content = "<span style='font-size:10px;'>" + event.value + "g</span>"
            bar.group = 2
            items.add(bar)
        }
        */
        if(event.type == "hero_history") {
            bar.className = "background-" + (heroes % 10)
            heroes += 1
            var img = constants.heroes[event.key].img
            bar.content = "<img src='" + img + "' width=40 />" + "<span style='font-size:10px;'>" + constants.heroes[event.key].localized_name + "</span>"
            bar.start = momentTime(event.time)
            bar.end = momentTime(event.end)
            bar.type = "background"
            bar.group = 1
            items.add(bar)
        }
    }
    /*
    var ab = match.players[ind].ability_upgrades
    for(var i = 0; i < ab.length; i++) {
        bar = {}
        bar.start =  momentTime(ab[i].time)
        bar.content = ab[i].ability
        bar.group=2
        items.add(bar)
    }
    */
    var groups = [{
        id: 0,
        content: "Hero"
    }, {
        id: 1,
        content: "Item"
    }                  
    /*
    {
        id: 2,
        content: "Skill"
    }
    */
                 ]
    // create visualization
    var container = document.getElementById('chart-timeline');
    var iDiv = document.createElement('div');
    container.appendChild(iDiv);
    var options = {
        zoomable: false,
        moveable: false,
        showCurrentTime: false,
        //stack: false,
        margin: {
            item: 2
        },
        padding: 1,
        start: moment().startOf('day').subtract(300, 'seconds'),
        end: moment().startOf('day').seconds(match.duration).add(180, 'seconds'),
        showMajorLabels: false,
        showMinorLabels: false
    };
    var timeline = new vis.Timeline(iDiv);
    timeline.setOptions(options);
    timeline.setItems(items);
    timeline.setGroups(groups);
})