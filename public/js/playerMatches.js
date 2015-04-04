var $ = jQuery = require('jquery');
var moment = require('moment');
var constants = require('../../sources.json');
var heroes = constants.heroes;
var modes = constants.modes;
var regions = constants.regions;
module.exports = function(matches) {
    $.fn.serializeObject = function() {
        var o = {};
        var a = this.serializeArray();
        $.each(a, function() {
            if (o[this.name] !== undefined) {
                if (!o[this.name].push) {
                    o[this.name] = [o[this.name]];
                }
                o[this.name].push(this.value || '');
            }
            else {
                o[this.name] = this.value || '';
            }
        });
        return o;
    };
    var table = $('#matches').on('xhr.dt', function(e, settings, json) {
        console.log(json);
        var pct = (json.aggData.win / json.aggData.games * 100).toFixed(2);
        $("#winrate").text(pct + "%").width(pct + "%");
    }).dataTable({
        "order": [
                [0, "desc"]
            ],
        //"data": matches,
        serverSide: true,
        ajax: {
            'url': '/api/matches',
            "data": function(d) {
                    d.select = $('form').serializeObject();
                    d.agg = {
                        "win": 1,
                        "lose": 1,
                        "games": 1
                    };
                }
        },
        "deferRender": true,
        "rowCallback": function(row, data) {
            $(row).addClass(data.player_win ? "success" : "danger");
        },
        "drawCallback": function() {
            tooltips();
            formatHtml();
        },
        
        stateSave: true,
        searching: false,
        processing: true,
        columns: [{
                data: 'match_id',
                title: 'Match ID',
                render: function(data, type) {
                    return '<a href="/matches/' + data + '">' + data + '</a>';
                }
            }, {
                data: 'players[0].hero_id',
                title: 'Hero',
                orderData: [2],
                render: function(data, type) {
                    return heroes[data] ? "<img src='" + heroes[data].img + "' title=\"" + heroes[data].localized_name + "\"/>" : data;
                }
            },
            {
                data: 'players[0].hero_id',
                title: 'Hero Name',
                visible: false,
                render: function(data, type) {
                    return heroes[data] ? heroes[data].localized_name : data;
                }
            },
            {
                data: 'player_win',
                title: 'Result',
                render: function(data, type, row) {
                    return (data) ? "Won" : "Lost";
                }
            },
            {
                data: 'game_mode',
                title: 'Game Mode',
                render: function(data, type) {
                    return modes[data] ? modes[data].name : data;
                }
            },
            {
                data: 'cluster',
                title: 'Region',
                render: function(data, type) {
                    return regions[data] ? regions[data] : data;
                }
            },
            {
                data: 'duration',
                title: 'Duration',
                render: function(data, type) {
                    return moment().startOf('day').seconds(data).format("H:mm:ss");
                }
            },
            {
                data: 'start_time',
                title: 'Played',
                render: function(data, type, row) {
                    return moment.unix(data + row.duration).fromNow();
                }
            },
            {
                data: 'players[0].kills',
                title: 'K',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].deaths',
                title: 'D',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].assists',
                title: 'A',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].last_hits',
                title: 'LH',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].denies',
                title: 'DN',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].gold_per_min',
                title: 'GPM',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].xp_per_min',
                title: 'XPM',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].hero_damage',
                title: 'HD',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].tower_damage',
                title: 'TD',
                render: function(data, type) {
                    return data;
                }
            },
            {
                data: 'players[0].hero_healing',
                title: 'HH',
                render: function(data, type) {
                    return data;
                }
            }]
    });
    $('form').submit(function(e) {
        //e.preventDefault();
        //console.log(JSON.stringify($('form').serializeObject()));
        //table.draw();
        //return false;
    });
    $('.form-control').on('change', function(e) {
        //table.draw();
    });
};
