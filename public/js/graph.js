var nodes = null;
var edges = null;
var options = null;
var network = null;

// create nodes
nodes = match.parsed_data.players;

// create edges
edges = match.parsed_data.edges;

// specify options
options = {
    zoomable: false,
    edges: {
        style: 'arrow'
    },
    nodes: {
        shape: 'dot'
    },
    physics: {barnesHut:{gravitationalConstant:-5000}}
};

// create the network
var container = document.getElementById('chart-kills');
var data = {
    nodes: nodes,
    edges: edges
};
network = new vis.Network(container, data, options);