var $ = jQuery = require('jquery');
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
    });
};
