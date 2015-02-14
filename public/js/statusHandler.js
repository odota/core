var moment = require('moment');

module.exports = function() {
    var socket = io.connect();
    socket.on('stats', function(data) {});
    console.log(data);
    for (var prop in data) {
        if (typeof data[prop] === "object") {
            $("#" + prop + " tbody").empty();
            for (var i = 0; i < data[prop].length; i++) {
                $(
                    "<tr>" +
                    "<td><a href='/matches/" + data[prop][i].match_id + "'>" + data[prop][i].match_id + "</a></td>" +
                    "<td class='fromNowAttr' time='" + (data[prop][i].start_time + data[prop][i].duration) + "'></td>" +
                    "</tr>").appendTo($("#" + prop + " tbody"));
            }
            //recompute times
            $(".fromNowAttr").each(function() {
                $(this).text(moment.unix($(this).attr("time")).fromNow());
            });
        }
        else {
            $("#" + prop).html(data[prop]);
        }
    }
};