module.exports = function tooltips() {
    $('[title]').qtip({
        style: 'qtip-dark'
    });
    $('.item').qtip({
        content: {
            text: function(event, api) {
                $.ajax({
                    url: '/api/items',
                    data: {
                        name: $(this).attr('title')
                    }
                }).then(function(data) {
                    const content = $('<div/>');
                    const tooltipDataOrder = [
                        'costDiv', 'desc', 'notes', 'attrib', 'cmb', 'lore'
                    ];
                    tooltipDataOrder.forEach((key) => {
                        content.append(data[key] ? $('<div/>', {
                            html: data[key]
                        }) : '');
                    });
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
        style: 'qtip-dark'
    });
    $('.ability').qtip({
        content: {
            text: function(event, api) {
                $.ajax({
                    url: '/api/abilities',
                    data: {
                        name: $(this).attr('title')
                    }
                }).then(function(data) {
                    const content = $('<div/>');
                    const tooltipDataOrder = [
                        'affects', 'desc', 'notes', 'attrib', 'dmg', 'cmb', 'lore'
                    ];
                    tooltipDataOrder.forEach((key) => {
                        content.append(data[key] ? $('<div/>', {
                            html: data[key]
                        }) : '');
                    });
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
        style: 'qtip-dark'
    });
};
