module.exports = function playerTrendsTables() {
    var builds = $('#builds').dataTable({
        "searching": false,
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
    var accuracy = $('#accuracy').dataTable({
        "searching": false,
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
}
