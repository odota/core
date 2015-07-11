module.exports =    function drawTeammates(data) {
        $('#teammates').dataTable({
            "searching": false,
            "paging": true,
            data: data,
            "order": [
            [1, "desc"]
        ],
            "drawCallback": function() {
                tooltips();
                formatHtml();
            },
            "columns": [{
                    data: "account_id",
                    title: "Name",
                    render: function(data, type, row) {
                        return '<a href="/players/' + data + '">' + row.personaname + '</a>'
                    }
            }, {
                    data: "games",
                    title: "Matches"
            }, {
                    data: "win",
                    title: "Win%",
                    render: function(data, type, row) {
                        var pct = data ? 100 * data / row.games : 0;
                        var elt = $('<div class="progress-bar"></div>');
                        elt.addClass(pct >= 50 ? "progress-bar-success" : "progress-bar-danger");
                        elt.css("width", pct + "%");
                        elt.text(pct.toFixed(2));
                        return '<div class="progress">' + elt[0].outerHTML + '</div>';
                    }
            }, {
                    data: "with_games",
                    title: "Played With"
            }, {
                    data: "with_win",
                    title: "Win%",
                    render: function(data, type, row) {
                        var pct = data ? 100 * data / row.with_games : 0;
                        var elt = $('<div class="progress-bar"></div>');
                        elt.addClass(pct >= 50 ? "progress-bar-success" : "progress-bar-danger");
                        elt.css("width", pct + "%");
                        elt.text(pct.toFixed(2));
                        return '<div class="progress">' + elt[0].outerHTML + '</div>';
                    }
            },
                {
                    data: "against_games",
                    title: "Played Against"
            }, {
                    data: "against_win",
                    title: "Win%",
                    render: function(data, type, row) {
                        var pct = data ? 100 * data / row.against_games : 0;
                        var elt = $('<div class="progress-bar"></div>');
                        elt.addClass(pct >= 50 ? "progress-bar-success" : "progress-bar-danger");
                        elt.css("width", pct + "%");
                        elt.text(pct.toFixed(2));
                        return '<div class="progress">' + elt[0].outerHTML + '</div>';
                    }
            },
                {
                    data: "last_played",
                    title: "Last",
                    render: function(data, type) {
                        if (type === "display") {
                            if (!Number(data)) {
                                return "never";
                            }
                            else {
                                return moment.unix(data).fromNow();
                            }
                        }
                        return data;
                    }
        }]
        });
    }