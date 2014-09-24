match.parsed_data.players.forEach(function (player, i){
    var items = new vis.DataSet();
    var heroes = 0
    for (var i=0;i<player.timeline.length;i++){
        var event = player.timeline[i]
        var bar = {}
        if (event.time < 0){
            time = moment().startOf('day').seconds(event.time*-1).format("-m:ss");
        }
        else{
            time = moment().startOf('day').seconds(event.time).format("m:ss");
        }
        bar.start=moment().startOf('day').seconds(event.time)
        if (event.type=="kills"){
            bar.content = "<div class='small'>"+match.players[event.key]+"</div>"+"<div class='small'>"+time+"</div>"
            bar.group=2
        }
        if (event.type=="runes"){
            bar.content = "<div class='small'>"+constants.runes[event.key].name+"</div>"+"<div class='small'>"+time+"</div>"
            bar.group=2

        }
        if (event.type=="buybacks"){
            bar.content = "<div class='small'>"+event.key+"</div>"+"<div class='small'>"+time+"</div>"
            bar.group=2

        }
        if (event.type=="itembuys"){
            var img = constants.items[event.key].img
            bar.content = "<img src='"+img+"' width=25 />"+"<div class='small'>"+time+"</div>"
            bar.group=1
        }
        if (event.type=="hero_history"){
            bar.className = "background-"+(heroes % 8)
            heroes+=1
            var img = constants.heroes[event.key].img
            bar.content = "<img src='"+img+"'/>"+"<div class='small'>"+time+"</div>"
            bar.start=moment().startOf('day').seconds(event.time)
            bar.end = moment().startOf('day').seconds(event.end)
            bar.type="background"
        }
        items.add(bar)
    }

    var groups=new vis.DataSet();
    groups.add([{id:1, content:"Items"},{id:1, content:"Events"}])

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
        margin:{
            item:{
                horizontal:0
            }
        },
        start: moment().startOf('day').subtract(180, 'seconds'),
        end: moment().startOf('day').seconds(match.duration).add(180, 'seconds'),
        showMajorLabels: false
    };

    var timeline = new vis.Timeline(iDiv);
    timeline.setOptions(options);
    timeline.setItems(items);
    timeline.setGroups(groups);
})

