match.parsed_data.players.forEach(function (player, i){
    var items = new vis.DataSet();
    var heroes = 0
    for (var i=0;i<player.timeline.length;i++){
        var event = player.timeline[i]
        var bar = {}
        bar.group=1
        if (event.time <0 ){
            time = moment().startOf('day').seconds(event.time*-1).format("-m:ss");
        }
        else{
            time = moment().startOf('day').seconds(event.time).format("m:ss");
        }
        bar.start=moment().startOf('day').seconds(event.time)
        if (event.type=="buybacks"){
            bar.content = "<div class='small'>"+event.key+"</div>"+"<div class='small'>"+time+"</div>"
            bar.type="box"
        }
        if (event.type=="itembuys"){
            bar.content = "<img src='"+event.img+"' width=25 />"+"<div class='small'>"+time+"</div>"
            bar.type="box"
        }
        if (event.type=="hero_history"){
            bar.className = "background-"+(heroes % 8)
            heroes+=1
            bar.content = "<div class='small'>"+event.key+"</div>"+"<img src='"+event.img+"'/>"+"<div class='small'>"+time+"</div>"
            bar.end = moment().startOf('day').seconds(event.end)
            bar.type="background"
        }
        items.add(bar)
    }

    var groups=new vis.DataSet();
    groups.add([{id:1, content:"Timeline"}])

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
        showMajorLabels: false
    };

    var timeline = new vis.Timeline(iDiv);
    timeline.setOptions(options);
    timeline.setItems(items);
    timeline.setGroups(groups);
})

