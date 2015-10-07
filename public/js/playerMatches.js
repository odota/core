window.playerMatches = function playerMatches(data, options) {
    $('#matches').dataTable({
        "order": [
                [0, "desc"]
            ],
        //"data": data,
        /*
        serverSide: true,
        ajax: {
            'url': '/api/matches',
            "data": function(d) {
                d.select = $('#query').serializeObject();
            }
        },
        */
        paging: options ? options.paging : true,
        pageLength: 20,
        lengthChange: false,
        //stateSave: true,
        searching: false,
        processing: true,
        columnDefs: [
            {
                "targets": "fromNow",
                render: function(data, type) {
                    if (type === "display") {
                        return moment.unix(data).fromNow();
                    }
                    return data;
                }
            },
            {
                "targets": "seconds",
                render: function(data, type) {
                    if (type === "display") {
                        return formatSeconds(data);
                    }
                    return data;
                }
            }
            ]
    });
};
var columns_deprecated = {
    columns: [
        {
            data: 'match_id',
            title: 'ID',
            render: function(data, type) {
                return '<a href="/matches/' + data + '">' + data + '</a>';
            }
            },

        {
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
        {
            data: 'player_win',
            title: 'Result',
            render: function(data, type, row) {
                return '<span class="' + (data ? "text-success" : "text-danger") + '">' + ((data) ? "Win" : "Loss") + '</span>';
            }
            },
        {
            data: 'game_mode',
            title: 'Mode',
            render: function(data, type) {
                return constants.game_mode[data] ? constants.game_mode[data].name : data;
            }
            },
        {
            data: 'skill',
            title: 'Skill',
            render: function(data, type) {
                return constants.skill[data] ? constants.skill[data] : "N/A";
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
            title: 'Ended',
            render: function(data, type, row) {
                if (type === 'sort') {
                    return data + row.duration; // Sort by unix timestamp
                }
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
            /*
            {
                data: 'players[0].denies',
                title: 'DN',
                render: function(data, type) {
                    return data;
                }
            },
            */
        {
            data: 'players[0].gold_per_min',
            title: 'GPM',
            render: function(data, type) {
                return data;
            }
            },
            /*
            {
                data: 'players[0].xp_per_min',
                title: 'XPM',
                render: function(data, type) {
                    return data;
                },
            },
            */
            //hd
            //td
            //hh
        {
            data: 'parse_status',
            title: 'Status',
            render: function(data, type) {
                return constants.parse_status[data] ? constants.parse_status[data] : data || "";
            }
            }
            ]
}