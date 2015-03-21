var $ = jQuery = require('jquery');
var utility = require('./utility');
var formatSeconds = utility.formatSeconds;
module.exports = function playerTables() {
    $('#teammates').dataTable({
        //"searching": false,
        "paging": true,
        "order": [
            [1, "desc"]
        ]
    });
    $('#heroes').dataTable({
        //"searching": false,
        "paging": true,
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
};
