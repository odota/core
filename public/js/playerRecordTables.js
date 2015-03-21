var $ = jQuery = require('jquery');
var utility = require('./utility');
var formatSeconds = utility.formatSeconds;
module.exports = function playerTables() {
    var accuracy = $('#accuracy').dataTable({
        "searching": true,
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
    var builds = $('#builds').dataTable({
        //"searching": false,
        "paging": true,
        "order": [
            [2, "asc"]
        ],
        "columns": [{}, {}, {
            render: function(data, type) {
                if (type === "display") {
                    return formatSeconds(data);
                }
                return data;
            }
        }, {}],
        "columnDefs": [{
            "targets": [0],
            "orderData": [1]
            }, {
            "targets": [1],
            visible: false
            }]
    });
    
    return [accuracy, builds];
};
