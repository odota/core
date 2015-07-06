module.exports = function statusHandler(data) {
    console.log(data);
    for (var prop in data) {
        if (typeof data[prop] === "object") {
            $("#" + prop + " tbody").empty();
            for (var i = 0; i < data[prop].length; i++) {
                $("<tr>" + "<td><a href='/matches/" + data[prop][i].match_id + "'>" + data[prop][i].match_id + "</a></td>" + "<td>" + data[prop][i].match_seq_num + "</td>" + "<td class='fromNow' data-time='" + (data[prop][i].start_time + data[prop][i].duration) + "'></td>" + "</tr>").appendTo($("#" + prop + " tbody"));
            }
            formatHtml();
        }
        else {
            $("#" + prop).html(data[prop]);
        }
    }
}