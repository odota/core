module.exports = function playerMatches() {
    //extend jquery to serialize form data to JSON
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
    //query form code
    $("#hero_id").select2({
        //placeholder: "Played Any Hero",
        maximumSelectionSize: 1
    });
    $("#with_account_id").select2({
        //placeholder: "Included: Any Player",
        tags: [],
        maximumSelectionSize: 10
    });
    $("#teammate_hero_id").select2({
        //placeholder: "Team: Any Hero",
        maximumSelectionSize: 4
    });
    $("#enemy_hero_id").select2({
        //placeholder: "Enemy: Any Hero",
        maximumSelectionSize: 5
    });
    $('form').submit(function(e) {
        //updates the table on form submit without reload
        //e.preventDefault();
        //console.log(JSON.stringify($('form').serializeObject()));
        //table.draw();
        //return false;
    });
    $('.form-control').on('change', function(e) {
        //updates the table on form change without reload
        //table.draw();
    });
    var table = $('#matches').on('xhr.dt', function(e, settings, json) {
        console.log(json);
        //draw things with the returned data
        //teammates for select2
        //var teammates = !{player ? JSON.stringify(player.teammates.map(function(t) {return {id: t.account_id,text: t.account_id+ "-" + t.personaname};})) : "[]"};
        //teammate table
        //hero table
        var pct = (json.aggData.win / json.aggData.games * 100).toFixed(2);
        $("#winrate").text(pct + "%").width(pct + "%");
        $("#record").text(json.aggData.win + "-" + json.aggData.lose);
        var teammates = $('#teammates').dataTable({
            //"searching": false,
            "paging": true,
            data: json.aggData.teammates,
            "order": [
            [1, "desc"]
        ],
            "columns": [{
                data: "account_id"
            }, {
                data: "games"
            }, {
                data: "win"
            }, {
                data: "last_played",
                render: function(data, type) {
                    if (type === "display") {
                        if (!Number(data)) {
                            return "never";
                        }
                        else {
                            return moment.unix(data).fromNow();
                        }
                    }
                    return data;
                }
        }]
        });
        var heroes = $('#heroes').dataTable({
            //"searching": false,
            "paging": true,
            data: json.aggData.matchups,
            "drawCallback": function() {
                tooltips();
                formatHtml();
            },

            "order": [
            [2, "desc"]
        ],
            "columns": [{
                data: "hero_id"
            }, {
                data: "games"
            }, {
                data: "win"
            }, {
                data: "with_games"
            },{
                data: "with_win"
            },{
                data: "against_games"
            },{
                data: "against_win"
            },{
                data: "last_played",
                render: function(data, type) {
                    if (type === "display") {
                        if (!Number(data)) {
                            return "never";
                        }
                        else {
                            return moment.unix(data).fromNow();
                        }
                    }
                    return data;
                }
        }]
        });
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
                //api enforces blank agg if null passed in, so this can be null or {}
                d.js_agg = {
                    "win": 1,
                    "lose": 1,
                    "games": 1,
                    "matchups": 1,
                    "teammates": 1
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
                    return constants.heroes[data] ? "<img src='" + constants.heroes[data].img + "' title=\"" + constants.heroes[data].localized_name + "\"/>" : data;
                }
            },
            {
                data: 'players[0].hero_id',
                title: 'Hero Name',
                visible: false,
                render: function(data, type) {
                    return constants.heroes[data] ? constants.heroes[data].localized_name : data;
                }
            },
            /*
            {
                data: 'player_win',
                title: 'Result',
                render: function(data, type, row) {
                    return (data) ? "Won" : "Lost";
                }
            },
            */
            {
                data: 'game_mode',
                title: 'Game Mode',
                render: function(data, type) {
                    return constants.game_mode[data] ? constants.game_mode[data].name : data;
                }
            },
            /*
            {
                data: 'cluster',
                title: 'Region',
                render: function(data, type) {
                    return constants.cluster[data] ? constants.cluster[data] : data;
                }
            },
            */
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
            }, {
                data: 'parse_status',
                title: 'Status',
                render: function(data, type) {
                    return constants.parse_status[data] ? constants.parse_status[data] : data;
                }
            }]
    });
};
