module.exports = function drawHeroes(data) {
    $('#heroes').dataTable({
        searching: false,
        paging: true,
        data: data,
        drawCallback: function drawCallback() {
            window.tooltips();
            window.formatHtml();
        },
        order: [
            [1, 'desc']
        ],
        columns: [
            {
                data: 'hero_id',
                title: 'Hero',
                render: function(data, type) {
                    if (!constants.heroes[data]) {
                        return data;
                    }
                    if (type === 'filter') {
                        return constants.heroes[data].localized_name;
                    } else {
                        return `<img src="${constants.heroes[data].img}" title="${constants.heroes[data].localized_name}"/>`;
                    }
                }
            },
            {
                data: 'games',
                title: 'Played As'
            },
            {
                data: 'win',
                title: 'Win%',
                render: function(data, type, row) {
                    const pct = data ? 100 * data / row.games : 0;
                    const elt = $('<div class="progress-bar"></div>');
                    elt.addClass(pct >= 50 ? 'progress-bar-success' : 'progress-bar-danger');
                    elt.css('width', pct + '%');
                    elt.text(pct.toFixed(2));
                    return `<div class="progress">${elt[0].outerHTML}</div>`;
                }
            },
            {
                data: 'with_games',
                title: 'Played With'
            },
            {
                data: 'with_win',
                title: 'Win%',
                render: function(data, type, row) {
                    const pct = data ? 100 * data / row.with_games : 0;
                    const elt = $('<div class="progress-bar"></div>');
                    elt.addClass(pct >= 50 ? 'progress-bar-success' : 'progress-bar-danger');
                    elt.css('width', pct + '%');
                    elt.text(pct.toFixed(2));
                    return `<div class="progress">${elt[0].outerHTML}</div>`;
                }
            },
            {
                data: 'against_games',
                title: 'Played Against'
            },
            {
                data: 'against_win',
                title: 'Win%',
                render: function(data, type, row) {
                    const pct = data ? 100 * data / row.against_games : 0;
                    const elt = $('<div class="progress-bar"></div>');
                    elt.addClass(pct >= 50 ? 'progress-bar-success' : 'progress-bar-danger');
                    elt.css('width', pct + '%');
                    elt.text(pct.toFixed(2));
                    return `<div class="progress">${elt[0].outerHTML}</div>`;
                }
            },
            {
                data: 'last_played',
                title: 'Last',
                render: function(data, type) {
                    if (type === 'display') {
                        if (!Number(data)) {
                            return 'never';
                        } else {
                            return moment.unix(data).fromNow();
                        }
                    }
                    return data;
                }
            }
        ]
    });
};
