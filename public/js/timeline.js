var groups = match.parsed_data.players;

// create a dataset with items
var items = match.parsed_data.purchases

// create visualization
var container = document.getElementById('chart-timeline');
var options = {
    zoomable: false
};

var timeline = new vis.Timeline(container);
timeline.setOptions(options);
timeline.setGroups(groups);
timeline.setItems(items);