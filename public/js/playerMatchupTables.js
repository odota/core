var $ = jQuery = require('jquery');
module.exports = function playerTables() {
    var teammates = $('#teammates').dataTable({
        //"searching": false,
        "paging": true,
        "order": [
            [1, "desc"]
        ]
    });
    var heroes = $('#heroes').dataTable({
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
    
    return [teammates, heroes];
};
