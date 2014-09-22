var items = []
match.parsed_data.players.forEach(function (player, i){
    for (var hero in player.hero_history){
        var bar = {}
        bar.content = player.hero_history[hero].localized_name
        bar.start=moment().startOf('day').seconds(player.hero_history[hero].start)
        bar.end = moment().startOf('day').seconds(player.hero_history[hero].end)
        bar.type="range"
        bar.group=i
        items.push(bar)
    }
})

match.parsed_data.players.forEach(function(player,i){
    player.id=i
    player.content = player.display_name
})

var groups = match.parsed_data.players

// create visualization
var container = document.getElementById('chart-timeline');
var options = {
    zoomable: false,
    stack: false
};

var timeline = new vis.Timeline(container);
timeline.setOptions(options);
timeline.setItems(items);
timeline.setGroups(groups);