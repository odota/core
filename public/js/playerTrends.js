var $records = $(".records"),
    $matchups = $(".matchups"),
    $wards = $(".wards"),
    $charts = $(".charts"),
    $content = $("#content");
$("#the_stats").empty();

function makeMatchupDT() {
    if (!$.fn.dataTable.isDataTable('#heroes')) {
        playerMatchupTables();
    }
}

function makeRecordsDT() {
    if (!$.fn.dataTable.isDataTable('#builds')) {
        playerRecordTables();
    }
}

function getCharts() {
    $content.empty();
    $content.append($charts);
    generateHistograms(aggData);
    if ($("#cal-heatmap").children().length < 1) {
        generateActivity(aggData);
    }
}

function getWards() {
    $content.empty();
    $content.append($wards);
    $(".activate").on('click', function() {
        heatmap.setData(posData[0][$(this).attr('id')]);
        heatmap.repaint();
    })
}

function getMatchups() {
    $content.empty();
    $content.append($matchups);
    makeMatchupDT();
}

function getRecords() {
    $content.empty();
    $content.append($records);
    makeRecordsDT();
}

function showSection() {
    if (window.location.hash) {
        var hash = window.location.hash.substring(1);
        console.log(hash);
        if (hash === "charts") {
            getCharts();
        }
        else if (hash === "wards") {
            getWards();
        }
        else if (hash === "matchups") {
            getMatchups();
        }
        else {
            getRecords();
        }
    }
    else {
        getRecords();
    }
}
showSection();
window.onhashchange = function() {
    showSection();
    tooltips();
    formatHtml();
}
$("#charts").click(function() {
    getCharts();
});
$("#wards").click(function() {
    getWards();
});
$("#records").click(function() {
    getRecords();
});
$("#matchups").click(function() {
    getMatchups();
});