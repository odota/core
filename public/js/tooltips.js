module.exports = function tooltips() {
    $('[title]').qtip({
        style: "qtip-dark"
    });
    $('.item').qtip({
        content: {
            text: function(event, api) {
                $.ajax({
                    url: "/api/items",
                    data: {
                        name: $(this).attr('title')
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
                    }) : "");
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
                        name: $(this).attr('title')
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
                    }) : "");
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
}