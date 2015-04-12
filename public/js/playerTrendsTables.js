function playerTrendsTables() {
    var accuracy = $('#accuracy').dataTable({
        "searching": true,
        "paging": true,
        "order": [
            [2, "desc"]
        ],
        "drawCallback": function() {
            tooltips();
            formatHtml();
        },
        "columnDefs": [{
            "targets": [0],
            "orderData": [1]
            }, {
            "targets": [1],
            //visible: false
            }]
    });
    var builds = $('#builds').dataTable({
        //"searching": false,
        "paging": true,
        "order": [
            [2, "asc"]
        ],
        "drawCallback": function() {
            tooltips();
            formatHtml();
        },
        "columnDefs": [{
            "targets": 0,
            "orderData": [1]
            }, {
            "targets": [1],
            //visible: false
            }, {
            targets: "time",
            render: function(data, type) {
                if (type === "display") {
                    return formatSeconds(data);
                }
                return data;
            }
        }]
    });
    var teammates = $('#teammates').dataTable({
        //"searching": false,
        "paging": true,
        "order": [
            [1, "desc"]
        ],
        "columnDefs": [{
            targets: "last_played",
            render: function(data, type) {
                if (type === "display") {
                    return moment.unix(data).fromNow();
                }
                return data;
            }
        }]
    });
    var heroes = $('#heroes').dataTable({
        //"searching": false,
        "paging": true,
        "order": [
            [2, "desc"]
        ],
        "drawCallback": function() {
            tooltips();
            formatHtml();
        },
        "columnDefs": [
            {
                "targets": "last_played",
                render: function(data, type) {
                    if (type === "display") {
                        return moment.unix(data).fromNow();
                    }
                    return data;
                }
        },
            {
                "targets": 0,
                "orderData": [1]
        },
            {
                "targets": [1],
                visible: false
        }]
    });
    return [accuracy, builds, teammates, heroes];
}
