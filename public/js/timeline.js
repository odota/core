module.exports = function timeline(objectives) {
  var items = [];
  for (var i = 0; i < objectives.length; i++) {
    var entry = objectives[i];
    var bar = {};
    var time = formatSeconds(entry.time);
    var img = entry.hero_img ? "<img src='" + entry.hero_img + "' width=30 />" : entry.team ? "The Dire" : "The Radiant";
    bar.start = moment().startOf('day').seconds(entry.time).toDate();
    bar.content = "<div style='font-size:10px;'>" + img + entry.objective + time + "</div>";
    bar.group = entry.team;
    items.push(bar);
  }
  //TODO set backgrounds as additional items pushed
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
    //TODO adjust start/end based on duration or max event?
    start: moment().startOf('day').subtract(180, 'seconds'),
    end: moment().startOf('day').seconds(objectives[objectives.length - 1].time).add(180, 'seconds'),
    showMajorLabels: false
      //showMinorLabels: false
  };
  var timeline = new vis.Timeline(container);
  timeline.setOptions(options);
  timeline.setItems(items);
  timeline.setGroups(groups);
  console.log(items);
}