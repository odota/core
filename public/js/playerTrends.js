var sections = [$(".records"), $(".matchups"), $(".wards"), $(".charts"), $("#content")];

function showSection(num) {
    sections.forEach(function(sec, index) {
        if (index === num) {
            sec.show();
        } else {
            sec.hide();
        }
    })
}

function getCharts() {
    showSection(3);
}

function getWards() {
    showSection(2);
}

function getMatchups() {
    showSection(1);
}

function getRecords() {
    showSection(0);
}

function getSection() {
    if (window.location.hash) {
        var hash = window.location.hash.substring(1);

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

getSection();

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