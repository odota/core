match.parsed_data.players.forEach(function (player, i){
    var items = []

    for (var hero in player.hero_history){
        var bar = {}
        bar.content = hero
        bar.start=moment().startOf('day').seconds(player.hero_history[hero].start)
        bar.end = moment().startOf('day').seconds(player.hero_history[hero].end)
        bar.type="background"
        items.push(bar)
    }
    player.build.forEach(function(item){
        var bar = {}
        //todo display item usage
        bar.start = moment().startOf('day').seconds(item.time)
        var uses = player.itemuses[item.key]
        bar.content = item.key +moment().startOf('day').seconds(item.time).format(" m'")
        bar.type="point"
        items.push(bar)
    })

    // create visualization
    var container = document.getElementById('chart-timeline');
    var label = document.createElement('h3')
    label.innerHTML = player.display_name
    var iDiv = document.createElement('div');
    container.appendChild(label)
    container.appendChild(iDiv);

    var options = {
        zoomable: false,
        moveable: false,
        margin: {
            item: 0,
            axis: 0
        },
        showMajorLabels: false
    };

    var timeline = new vis.Timeline(iDiv);
    timeline.setOptions(options);
    timeline.setItems(items);
})

