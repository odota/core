var $ = jQuery = require('jquery');
var utility = require('./utility');
var formatSeconds = utility.formatSeconds;
module.exports = function playerTables() {
    $('#accuracy').dataTable({
        "searching": false,
        "paging": true,
        "order": [
            [1, "desc"]
        ]
    });
    $('#builds').dataTable({
        //"searching": false,
        "paging": true,
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
};
