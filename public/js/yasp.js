function format(input) {
    input = Number(input)
    if (input === 0) {
        return "-"
    }
    return (Math.abs(input) < 1000 ? ~~(input) : numeral(input).format('0.0a'));
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function formatSeconds(input) {
    var absTime = Math.abs(input)
    var minutes = ~~(absTime / 60)
    var seconds = pad(absTime % 60, 2)
    var time = ((input < 0) ? "-" : "")
    time += minutes + ":" + seconds
    return time
}

function momentTime(input) {
    return moment().startOf('day').seconds(input)
}
$(document).ready(function() {
    $('table.summable').each(function(i, table) {
        //iterate through rows
        var sums = {
            Radiant: {},
            Dire: {}
        }
        var tbody = $(table).find('tbody')
        tbody.children().each(function(i, row) {
                row = $(row)
                var target = (row.hasClass('success')) ? sums.Radiant : sums.Dire
                    //iterate through cells
                row.children().each(function(j, cell) {
                    cell = $(cell)
                    if (!target[j]) {
                        target[j] = 0
                    }
                    var content = cell.clone() //clone the element
                        .children() //select all the children
                        .remove() //remove all the children
                        .end() //again go back to selected element
                        .text();
                    target[j] += Number(content) || 0
                })
            })
            //add sums to table
        var tfoot = $("<tfoot>")
        for (var key in sums) {
            var tr = $("<tr>")
            var sum = sums[key]
            sum["0"] = key
            for (var index in sum) {
                var td = $("<td>")
                if (index != "0") {
                    td.addClass('format')
                }
                td.text(sum[index])
                tr.append(td)
            }
            tfoot.append(tr)
        }
        $(table).append(tfoot)
    })
    $('.format').each(function() {
        $(this).text(format($(this).text()))
    })
    $('.fromNow').each(function() {
        $(this).text(moment.unix($(this).text()).fromNow())
    })
    $('.format-seconds').each(function() {
        $(this).text(formatSeconds($(this).text()))
    })
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
    $('[title!=""]').qtip({
        style: "qtip-dark"
    });
    $('.item').qtip({
        content: {
            text: function(event, api) {
                $.ajax({
                    url: "/api/items",
                    data: {
                        name: $(this).attr('alt')
                    }
                }).then(function(data) {
                    var content = $("<div/>")
                    content.append(data.cost ? $("<div/>", {
                        html: '<img alt="Gold Cost" title="Gold Cost" class="goldImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/gold.png" width="16" height="16" border="0" />' + data.cost
                    }) : "")
                    content.append(data.desc ? $("<div/>", {
                        html: data.desc
                    }) : "")
                    content.append(data.notes ? $("<div/>", {
                        html: data.notes
                    }) : "")
                    content.append(data.attrib ? $("<div/>", {
                        html: data.attrib
                    }) : "")
                    content.append(data.mc ? $("<div/>", {
                        html: '<img alt="Mana Cost" title="Mana Cost" class="manaImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/mana.png" width="16" height="16" border="0" />' + data.mc
                    }) : "")
                    content.append(data.cd ? $("<div/>", {
                        html: '<img alt="Cooldown" title="Cooldown" class="cooldownImg" src="http://cdn.dota2.com/apps/dota2/images/tooltips/cooldown.png" width="16" height="16" border="0" />' + data.cd
                    }) : "")
                    content.append(data.lore ? $("<div/>", {
                            html: data.lore
                        }) : "")
                        // Set the tooltip content upon successful retrieval
                    api.set('content.text', content.html());
                    api.set('content.title', data.dname);
                }, function(xhr, status, error) {
                    // Upon failure... set the tooltip content to the status and error value
                    api.set('content.text', status + ': ' + error);
                });
                return 'Loading...'; // Set some initial text
            }
        },
        style: "qtip-dark"
    });
    $('.ability').qtip({
        content: {
            text: function(event, api) {
                $.ajax({
                    url: "/api/abilities",
                    data: {
                        name: $(this).attr('alt')
                    }
                }).then(function(data) {
                    var content = $("<div/>")
                    content.append(data.affects ? $("<div/>", {
                        html: data.affects
                    }) : "")
                    content.append(data.desc ? $("<div/>", {
                        html: data.desc
                    }) : "")
                    content.append(data.notes ? $("<div/>", {
                        html: data.notes
                    }) : "")
                    content.append(data.attrib ? $("<div/>", {
                        html: data.attrib
                    }) : "")
                    content.append(data.dmg ? $("<div/>", {
                        html: data.dmg
                    }) : "")
                    content.append(data.cmb ? $("<div/>", {
                        html: data.cmb
                    }) : "")
                    content.append(data.lore ? $("<div/>", {
                        html: data.lore
                    }) : "")

                    // Set the tooltip content upon successful retrieval
                    api.set('content.text', content.html());
                    api.set('content.title', data.dname);
                }, function(xhr, status, error) {
                    // Upon failure... set the tooltip content to the status and error value
                    api.set('content.text', status + ': ' + error);
                });
                return 'Loading...'; // Set some initial text
            }
        },
        style: "qtip-dark"
    });
})