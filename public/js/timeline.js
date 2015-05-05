module.exports = function timeline(objectives) {
  var items = [];
  for (var i = 0; i < objectives.length; i++) {
    var entry = objectives[i];
    var bar = {};
    var time = formatSeconds(entry.time);
    time = "<div style='font-size:10px;'>" + time + "<div>";
    bar.start = moment().startOf('day').seconds(entry.time);
    /*
     - var adjSlot = match.players[entry.slot] ? entry.slot : entry.slot-5
    - var objective = constants.objectives[entry.subtype] || entry.subtype
    - var p = match.players[adjSlot] || {}
    - var hero = constants.heroes[p.hero_id]
    - var slot_color = constants.player_colors[p.player_slot]
    - var team = entry.team===2 || entry.key<64 || p.isRadiant ? "success" : "danger"
    tr(class=team)
      td.format-seconds(data-format-seconds=entry.time)
      td= objective
      td
        if hero
          img(src=hero.img, title=hero.localized_name)
        else
          =team==="success" ? "The Radiant" : "The Dire"
      td=constants.barracks_value[entry.key]
      */
    var img = "";
    var team = entry.team === 2 || entry.key < 64 || entry.isRadiant ? 0 : 1;
    bar.content = "<img src='" + img + "' width=30 />" + time;
    bar.content = entry.subtype;
    bar.group = team;
    items.push(bar);
  }
  //TODO entries need player hero, isRadiant
  //TODO server side needs to fill hero image, isRadiant, player color
  //TODO set backgrounds
  var groups = [{
    id: 0,
    content: "Radiant"
                }, {
    id: 1,
    content: "Dire"
                }];
  // create visualization
  var container = document.getElementById('timeline');
  var options = {
    zoomable: false,
    moveable: false,
    showCurrentTime: false,
    //stack: false,
    margin: {
      item: 2
    },
    padding: 1,
    //TODO adjust start/end based on duration or max event?
    start: moment().startOf('day').subtract(300, 'seconds'),
    end: moment().startOf('day').seconds(match.duration).add(180, 'seconds'),
    showMajorLabels: false,
    showMinorLabels: false
  };
  var timeline = new vis.Timeline(container);
  timeline.setOptions(options);
  timeline.setItems(items);
  timeline.setGroups(groups);
}