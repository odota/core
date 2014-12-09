$('#table').dataTable({
    "order": [[ 0, "desc" ]],
    ajax: '/api/matches',
    serverSide: true,
    processing: true,
    columns: [
        {
            data: 'match_id',
            title: 'Match ID',
            render: function(data, type, row, meta) {
                return '<a href="/matches/' + data + '">' + data + '</a>'
            }
        },
        {
            data: 'game_mode',
            title: 'Game Mode',
            render: function(data, type, row, meta) {
                return modes[data] ? modes[data].name : data
            }
        },
        {
            data: 'cluster',
            title: 'Region',
            render: function(data, type, row, meta) {
                return regions[data] ? regions[data] : data
            }
        },
        {
            data: 'duration',
            title: 'Duration',
            render: function(data, type, row, meta) {
                return moment().startOf('day').seconds(data).format("H:mm:ss")
            }
        },
        {
            data: 'start_time',
            title: 'Played',
            render: function(data, type, row, meta) {
                return moment.unix(data + row.duration).fromNow()
            }
        },
        {
            data: 'parse_status',
            title: 'Status',
            render: function(data, type, row, meta) {
                return parse_status[data] ? parse_status[data] : data
            }
        }
    ]
});

