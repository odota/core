$('#table').dataTable({
    "order": [[ 0, "desc" ]],
    ajax: '/api/matches',
    serverSide: true,
    columns: [
        { data: 'match_id',
         title: 'Match ID'  },
        { data: 'game_mode',
         title: 'Game Mode' },
        { data: 'cluster',
         title: 'Region' },
        { data: 'duration',
         title: 'Duration' },
        { data: 'start_time',
         title: 'Played' },
        { data: 'parse_status',
         title: 'Status' }
    ]
});

