var $ = jQuery = require('jquery');
module.exports = function playerTables() {
    console.log("player tables");
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
        }]
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
        }]
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
        }]
    });
    //todo serverside filtering
    $('#matches').dataTable({
        "order": [
            [0, "desc"]
        ],
        "columnDefs": [{
            "targets": [1],
            "orderData": [2]
        }, {
            "targets": [2],
            visible: false
        }]
    });
}