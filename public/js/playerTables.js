var $ = jQuery = require('jquery');
var moment = require('moment');
var constants = require('../../sources.json');
var heroes = constants.heroes;
var modes = constants.modes;
var regions = constants.regions;
module.exports = function playerTables() {
    $(document).on('ready', function() {
        $('#teammates').dataTable({
            "order": [
                [1, "desc"]
            ]
        });
        $('#heroes').dataTable({
            "order": [
                [2, "desc"]
            ],
            "columnDefs": [{
                "targets": [0],
                "orderData": [1]
            }, {
                "targets": [1],
                visible: false
            }],
            "paging": false
        });
        $('#together').dataTable({
            "order": [
                [2, "desc"]
            ],
            "columnDefs": [{
                "targets": [0],
                "orderData": [1]
            }, {
                "targets": [1],
                visible: false
            }],
            "paging": false
        });
        $('#against').dataTable({
            "order": [
                [2, "desc"]
            ],
            "columnDefs": [{
                "targets": [0],
                "orderData": [1]
            }, {
                "targets": [1],
                visible: false
            }],
            "paging": false
        });
        //todo support querying on server, paging/sorting on client side
        //todo returns all matches of a player by default, allow filtering
        //todo re-activate tooltips on draw
        //todo limit the size of results api will return?
        //todo allow sorting by hero name
        $('#matches').dataTable({
            "order": [
                [0, "desc"]
            ],
            ajax: {
                'url': '/api/matches',
                'data': {
                    "project": {
                        start_time: 1,
                        match_id: 1,
                        cluster: 1,
                        game_mode: 1,
                        duration: 1,
                        radiant_win: 1,
                        "players.$": 1
                    },
                    "select": {
                        "players.account_id": account_id
                    }
                },
                "dataSrc":function(json){
                    console.log(json);
                    return json.data;
                }
            },
            "rowCallback": function(row, data) {
                var cl = data.players[0].player_slot < 64 === data.radiant_win ? "success" : "danger";
                $(row).addClass(cl);
            },
            serverSide: true,
            stateSave: true,
            columns: [{
                data: 'match_id',
                title: 'Match ID',
                render: function(data, type, row, meta) {
                    return '<a href="/matches/' + data + '">' + data + '</a>';
                }
            }, {
                data: 'players[0].hero_id',
                title: 'Hero',
                render: function(data, type, row, meta) {
                    return heroes[data] ? "<img src='" + heroes[data].img + "' title='" + heroes[data].localized_name + "'/>" : data;
                }
            }, {
                data: 'radiant_win',
                title: 'Result',
                render: function(data, type, row, meta) {
                    row.player_win = data === row.players[0].player_slot < 64;
                    return row.player_win ? "Won" : "Lost";
                }
            }, {
                data: 'game_mode',
                title: 'Game Mode',
                render: function(data, type, row, meta) {
                    return modes[data] ? modes[data].name : data;
                }
            }, {
                data: 'cluster',
                title: 'Region',
                render: function(data, type, row, meta) {
                    return regions[data] ? regions[data] : data;
                }
            }, {
                data: 'duration',
                title: 'Duration',
                render: function(data, type, row, meta) {
                    return moment().startOf('day').seconds(data).format("H:mm:ss");
                }
            }, {
                data: 'start_time',
                title: 'Played',
                render: function(data, type, row, meta) {
                    return moment.unix(data + row.duration).fromNow();
                }
            }, {
                data: 'players[0].kills',
                title: 'K',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].deaths',
                title: 'D',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].assists',
                title: 'A',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].last_hits',
                title: 'LH',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].denies',
                title: 'DN',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].gold_per_min',
                title: 'GPM',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].xp_per_min',
                title: 'XPM',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].hero_damage',
                title: 'HD',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].tower_damage',
                title: 'TD',
                render: function(data, type, row, meta) {
                    return data;
                }
            }, {
                data: 'players[0].hero_healing',
                title: 'HH',
                render: function(data, type, row, meta) {
                    return data;
                }
            }]
        });
    });
};