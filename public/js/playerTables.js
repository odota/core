var $ = jQuery = require('jquery');
var utility = require('./utility');
var formatSeconds = utility.formatSeconds;
module.exports = function playerTables() {
    $(document).on('ready', function() {
        $('#teammates').dataTable({
            //"searching": false,
            "paging": false,
            "order": [
                [1, "desc"]
            ]
        });
        $('#heroes').dataTable({
            //"searching": false,
            "paging": false,
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
        $('#builds').dataTable({
            //"searching": false,
            "paging": false,
            "order": [
                [1, "asc"]
            ],
            columns: [{}, {
                render: function(data, type) {
                    if (type === "display") {
                        return formatSeconds(data);
                    }
                    return data;
                }
            }, {}]
        });
    });
};
