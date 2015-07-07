module.exports = function drawProMatches(data) {
    $('#pro_matches').dataTable({
        "order": [
                [0, "desc"]
            ],
        "data": data,
        /*
        serverSide: true,
        ajax: {
            'url': '/api/matches',
            "data": function(d) {
                d.select = $('#query').serializeObject();
            }
        },
        */
        "drawCallback": function() {
            window.tooltips();
            window.formatHtml();
        },
        stateSave: true,
        searching: false,
        processing: true,
        columns: [
            {
                data: 'match_id',
                title: 'Match ID',
                render: function(data, type) {
                    return '<a href="/matches/' + data + '">' + data + '</a>';
                }
            },
            /*
            {
                data: 'league_name',
                title: 'League',
                render: function(data, type) {
                    return data ? data : "Unknown";
                }
            },
            */
            {
                data: 'radiant_name',
                title: 'Radiant',
                render: function(data, type) {
                    return data ? data : "Unknown";
                }
            },
            {
                data: 'dire_name',
                title: 'Dire',
                render: function(data, type) {
                    return data ? data : "Unknown";
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
                    if (type === 'sort') {
                        return data + row.duration; // Sort by unix timestamp
                    }
                    return moment.unix(data + row.duration).fromNow();
                }
            },
            {
                data: 'parse_status',
                title: 'Status',
                render: function(data, type) {
                    return constants.parse_status[data] ? constants.parse_status[data] : data;
                }
            }]
    });
};