var moment = require('moment');
var async = require('async');
var numeral = require('numeral');
var d3 = require('d3');
var c3 = require('c3');
var CalHeatMap = require('cal-heatmap');
var $ = jQuery = require('jquery');
var qtip = require('qtip2');
$.qtip = qtip;
//var dataTable = DataTable = require('datatables');
//$.dataTable = dataTable;
var constants = require('./sources.json');
var modes = constants.modes;
var regions = constants.regions;
var parse_status = constants.parse_status;

//functions to call on demand
global.generateCharts = generateCharts;
global.generateCalHeatmap = generateCalHeatmap;
global.matchTable = matchTable;
global.playerTables = playerTables;
global.uploadReplay = uploadReplay;
global.buildMap = buildMap;

//run on each page
$(document).ready(function() {
    process();
    changeTheme();
    tooltips();
});

//ga
(function(i, s, o, g, r, a, m) {
    i['GoogleAnalyticsObject'] = r;
    i[r] = i[r] || function() {
        (i[r].q = i[r].q || []).push(arguments)
    }, i[r].l = 1 * new Date();
    a = s.createElement(o),
        m = s.getElementsByTagName(o)[0];
    a.async = 1;
    a.src = g;
    m.parentNode.insertBefore(a, m)
})(window, document, 'script', '//www.google-analytics.com/analytics.js', 'ga');
ga('create', 'UA-55757642-1', 'auto');
ga('require', 'displayfeatures');
ga('send', 'pageview');

function uploadReplay() {
    $("#button").click(function(event) {
        event.preventDefault();
        $.post(
            "/verify_recaptcha", {
                recaptcha_challenge_field: $('#recaptcha_challenge_field').val(),
                recaptcha_response_field: $('#recaptcha_response_field').val()
            },
            function(data) {
                if (data.verified) {
                    $("#upload").submit();
                }
                else {
                    $("h1").after("<div role='alert' class='failure alert alert-warning'> Recaptcha failed. Please Try again.</div");
                    $(".failure").fadeOut(3000);
                    Recaptcha.reload();
                }
            }
        );
    });
}

function playerTables() {
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
    console.log(durations);
    c3.generate({
        bindto: "#chart-duration",
        data: {
            columns: [
                ['# Matches'].concat(durations)
            ],
            type: 'bar'
        },
        bar: {
            width: {
                ratio: 0.5 // this makes bar width 50% of length between ticks
            }
            // or
            //width: 100 // this makes bar width 100px
        }
    });
}

function matchTable() {
    $('#table').dataTable({
        "order": [
            [0, "desc"]
        ],
        ajax: '/api/matches',
        serverSide: true,
        processing: true,
        searching: false,
        stateSave: true,
        columns: [{
            data: 'match_id',
            title: 'Match ID',
            render: function(data, type, row, meta) {
                return '<a href="/matches/' + data + '">' + data + '</a>';
            }
        }, {
            data: 'game_mode',
            title: 'Game Mode',
            render: function(data, type, row, meta) {
                return modes[data] ? modes[data].name : data;
            }
        }, {
            data: 'cluster',
            title: 'Region',
            render: function(data, type, row, meta) {
                return regions[data] ? regions[data] : data;
            }
        }, {
            data: 'duration',
            title: 'Duration',
            render: function(data, type, row, meta) {
                return moment().startOf('day').seconds(data).format("H:mm:ss");
            }
        }, {
            data: 'start_time',
            title: 'Played',
            render: function(data, type, row, meta) {
                return moment.unix(data + row.duration).fromNow();
            }
        }, {
            data: 'parse_status',
            title: 'Status',
            render: function(data, type, row, meta) {
                return parse_status[data] ? parse_status[data] : data;
            }
        }]
    });
}

function process() {
    console.log('processing html');
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
}

function changeTheme() {
    var $dark = $("#dark");
    $dark.change(function() {
        console.log($dark.is(":checked"));
        $.post(
            "/preferences", {
                dark: $dark.is(":checked")
            },
            function(data) {
                if (data.sync) {
                    location.reload(true);
                }
                else {
                    $(".page-header").after("<div role='alert' class='sync alert alert-warning'>Failed to update preferences. Try again later.</div>");
                }
                $(".sync").fadeOut(3000);
            })
    })
}

function tooltips() {
    console.log('init tooltips');
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
    $('[title]').qtip({
        style: "qtip-dark"
    });

}

function buildMap() {
    console.log('building map');
    var buildingData = [{
        id: "t4br",
        style: "position: absolute; top: 78%; left: 17%;"
    }, {
        id: "t4tr",
        style: "position: absolute; top: 77%; left: 15%;"
    }, {
        id: "t3br",
        style: "position: absolute; top: 86%; left: 26%;"
    }, {
        id: "t2br",
        style: "position: absolute; top: 86%; left: 43%;"
    }, {
        id: "t1br",
        style: "position: absolute; top: 86%; left: 80%;"
    }, {
        id: "t3mr",
        style: "position: absolute; top: 72%; left: 22%;"
    }, {
        id: "t2mr",
        style: "position: absolute; top: 64%; left: 30%;"
    }, {
        id: "t1mr",
        style: "position: absolute; top: 56%; left: 38%;"
    }, {
        id: "t3tr",
        style: "position: absolute; top: 67%; left: 9%;"
    }, {
        id: "t2tr",
        style: "position: absolute; top: 50%; left: 9%;"
    }, {
        id: "t1tr",
        style: "position: absolute; top: 40%; left: 9%;"
    }, {
        id: "brbr",
        style: "position: absolute; top: 85%; left: 24%;"
    }, {
        id: "bmbr",
        style: "position: absolute; top: 87%; left: 24%;"
    }, {
        id: "brmr",
        style: "position: absolute; top: 73%; left: 18%;"
    }, {
        id: "bmmr",
        style: "position: absolute; top: 74%; left: 20%;"
    }, {
        id: "brtr",
        style: "position: absolute; top: 69%; left: 8%;"
    }, {
        id: "bmtr",
        style: "position: absolute; top: 69%; left: 10%;"
    }, {
        id: "t4bd",
        style: "position: absolute; top: 19%; left: 83%;"
    }, {
        id: "t4td",
        style: "position: absolute; top: 18%; left: 81%;"
    }, {
        id: "t3bd",
        style: "position: absolute; top: 31%; left: 87%;"
    }, {
        id: "t2bd",
        style: "position: absolute; top: 45%; left: 87%;"
    }, {
        id: "t1bd",
        style: "position: absolute; top: 60%; left: 87%;"
    }, {
        id: "t3md",
        style: "position: absolute; top: 27%; left: 73%;"
    }, {
        id: "t2md",
        style: "position: absolute; top: 37%; left: 63%;"
    }, {
        id: "t1md",
        style: "position: absolute; top: 47%; left: 53%;"
    }, {
        id: "t3td",
        style: "position: absolute; top: 13%; left: 70%;"
    }, {
        id: "t2td",
        style: "position: absolute; top: 13%; left: 50%;"
    }, {
        id: "t1td",
        style: "position: absolute; top: 13%; left: 20%;"
    }, {
        id: "brbd",
        style: "position: absolute; top: 29%; left: 86%;"
    }, {
        id: "bmbd",
        style: "position: absolute; top: 29%; left: 88%;"
    }, {
        id: "brmd",
        style: "position: absolute; top: 25%; left: 74%;"
    }, {
        id: "bmmd",
        style: "position: absolute; top: 26%; left: 76%;"
    }, {
        id: "brtd",
        style: "position: absolute; top: 12%; left: 72%;"
    }, {
        id: "bmtd",
        style: "position: absolute; top: 14%; left: 72%;"
    }, {
        id: "ar",
        style: "position: absolute; top: 79%; left: 12%;"
    }, {
        id: "ad",
        style: "position: absolute; top: 14%; left: 83%;"
    }]

    var bits = pad(Number($('#map').attr('data-tower-radiant')).toString(2), 11);
    bits += pad(Number($('#map').attr('data-barracks-radiant')).toString(2), 6);
    bits += pad(Number($('#map').attr('data-tower-dire')).toString(2), 11);
    bits += pad(Number($('#map').attr('data-barracks-dire')).toString(2), 6);
    bits += $('#map').attr('data-radiant-win') === "1" ? "10" : "01";
    //concat, iterate through bits of all four status values
    //if 1, create image
    //building data in correct order
    //determine ancient display by match winner
    for (var i = 0; i < bits.length; i++) {
        var d = buildingData[i];
        d.src = 'https://raw.githubusercontent.com/kronusme/dota2-api/master/images/map/';
        d.src += buildingData[i].id.slice(0, 1) === "t" ? 'tower' : 'racks';
        d.src += buildingData[i].id.slice(-1) === "r" ? '_radiant.png' : '_dire.png';
        d.class = buildingData[i].id.slice(0, 1) === "a" ? "" : "icon";
        d.style += bits[i] === "1" ? "" : "opacity: 0.2;";
        $('#map').append(($('<img>', d)));
    }
}

function generateCharts(data) {
    var height = 400;
    var difference = data.difference;
    var gold = data.gold;
    var xp = data.xp;
    var lh = data.lh;
    var charts = [{
        bindTo: "#chart-diff",
        columns: difference,
        x: 'time',
        type: "area-spline",
        xLabel: 'Game Time (minutes)',
        yLabel: 'Radiant Advantage'
    }, {
        bindTo: "#chart-gold",
        columns: gold,
        x: 'time',
        type: "spline",
        xLabel: 'Game Time (minutes)',
        yLabel: 'Gold'
    }, {
        bindTo: "#chart-xp",
        columns: xp,
        x: 'time',
        type: "spline",
        xLabel: 'Game Time (minutes)',
        yLabel: 'XP'
    }, {
        bindTo: "#chart-lh",
        columns: lh,
        x: 'time',
        type: "spline",
        xLabel: 'Game Time (minutes)',
        yLabel: 'LH'
    }];

    async.eachSeries(charts, function(chart, cb) {
        c3.generate({
            bindto: chart.bindTo,
            size: {
                height: height
            },
            data: {
                x: chart.x,
                columns: chart.columns,
                type: chart.type
            },
            axis: {
                x: {
                    type: 'timeseries',
                    tick: {
                        format: function(x) {
                            return moment().startOf('day').seconds(x).format("H:mm");
                        }
                    },
                    label: chart.xLabel
                },
                y: {
                    label: chart.yLabel
                }
            }
        });
        setTimeout(cb, 50);
    });
}

function generateCalHeatmap(data) {
        var cal = new CalHeatMap();
        cal.init({
            start: new Date(moment().subtract(1, 'year')),
            range: 13,
            domain: "month",
            subDomain: "day",
            data: data,
            tooltip: true,
            legend: [1, 2, 3, 4],
            highlight: new Date(),
            itemName: ["match", "matches"],
            subDomainTextFormat: function(date, value) {
                return value;
            },
            cellSize: 15,
            previousSelector: "#prev",
            nextSelector: "#next"
        });
    }
    /*
    function generateTimeline(match) {
        $(document).on('ready', function() {
            for (var player in match.parsed_data.heroes) {
                var items = []
                var heroes = 0
                var player = match.parsed_data.heroes[player]
                if (player.timeline.length < 1) continue
                for (var i = 0; i < player.timeline.length; i++) {
                    var event = player.timeline[i]
                    var bar = {}
                    var time = formatSeconds(event.time)
                    time = "<div style='font-size:10px;'>" + time + "<div>"
                    bar.start = moment().startOf('day').seconds(event.time)
                    if (event.type == "itembuys") {
                        //var img = constants.items[event.key].img
                        //bar.content = "<img src='" + img + "' width=30 />" + time
                        bar.content = event.key
                        bar.group = 1
                        items.push(bar)
                    }
                    if (event.type == "hero_history") {
                        bar.className = "background-" + (heroes % 10)
                        heroes += 1
                            //var img = constants.heroes[event.key].img
                            //bar.content = "<img src='" + img + "' width=40 />" + "<span style='font-size:10px;'>" + constants.heroes[event.key].localized_name + "</span>"
                        bar.content = event.key
                        bar.start = moment().startOf('day').seconds(event.time)
                        bar.end = moment().startOf('day').seconds(event.end)
                        bar.type = "background"
                        bar.group = 1
                        items.push(bar)
                    }
                }
                var groups = [{
                        id: 0,
                        content: "Hero"
                    }, {
                        id: 1,
                        content: "Item"
                    }]
                    // create visualization
                var container = document.getElementById('timeline');
                var options = {
                    zoomable: false,
                    moveable: false,
                    showCurrentTime: false,
                    //stack: false,
                    margin: {
                        item: 2
                    },
                    padding: 1,
                    start: moment().startOf('day').subtract(300, 'seconds'),
                    end: moment().startOf('day').seconds(match.duration).add(180, 'seconds'),
                    showMajorLabels: false,
                    showMinorLabels: false
                };
                var timeline = new vis.Timeline(container);
                timeline.setOptions(options);
                timeline.setItems(items);
                timeline.setGroups(groups);
            }
        });
    }
    */
function format(input) {
    input = Number(input);
    if (input === 0) {
        return "-";
    }
    return (Math.abs(input) < 1000 ? ~~(input) : numeral(input).format('0.0a'));
}

function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function formatSeconds(input) {
    var absTime = Math.abs(input);
    var minutes = ~~(absTime / 60);
    var seconds = pad(absTime % 60, 2);
    var time = ((input < 0) ? "-" : "");
    time += minutes + ":" + seconds;
    return time;
}
