match.parsed_data.players.forEach(function (player, i){
    var items = []

    for (var i=0;i<player.timeline.length;i++){
        var event = player.timeline[i]
        var bar = {}
        if (event.time <0 ){
            time = moment().startOf('day').seconds(event.time*-1).format(" -m:ss");
        }
        else{
            time = moment().startOf('day').seconds(event.time).format(" m:ss");
        }
        bar.content = event.key + time
        bar.start=moment().startOf('day').seconds(event.time)
        if (event.type=="itembuys"){
            bar.content = "<img src='http://cdn.dota2.com/apps/dota2/images/items/"+event.img+"' width=30 /><br>"+time
            bar.type="point"
        }
        if (event.type=="hero_history"){
            //construct image
            bar.end = moment().startOf('day').seconds(event.end)
            bar.type="background"
        }
        items.push(bar)
    }

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
        showCurrentTime: false,
        start: moment().startOf('day').subtract(180, 'seconds'),
        end: moment().startOf('day').seconds(match.duration).add(180, 'seconds'),
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

