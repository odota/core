var $ = jQuery = require('jquery');
var moment = require('moment');
var constants = require('../../sources.json');
var modes = constants.modes;
var regions = constants.regions;
var parse_status = constants.parse_status;
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
    });
};