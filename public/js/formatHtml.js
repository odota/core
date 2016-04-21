window.formatHtml = function formatHtml() {
    $('table.summable').each(function(i, table) {
        //iterate through rows
        var sums = {
            //Total: {},
            Radiant: {},
            Dire: {}
        };
        var negatives = {};
        var tbody = $(table).find('tbody');
        //var target = sums.Total;
        tbody.children().each(function(i, row) {
            row = $(row);
            var target = $(row).hasClass("radiant") ? sums.Radiant : sums.Dire;
            //iterate through cells
            row.children().each(function(j, cell) {
                cell = $(cell);
                if (!target[j]) {
                    target[j] = 0;
                }
                negatives[j] = cell.hasClass('negative');
                var content = cell.clone() //clone the element
                    .children() //select all the children
                    .remove() //remove all the children
                    .end() //again go back to selected element
                    .text();
                //todo support stuff like % symbols
                target[j] += Number(content) || 0;
            });
        });
        //console.log(sums, negatives)
        //add sums to table
        var tfoot = $("<tfoot>");
        for (var key in sums) {
            var tr = $("<tr>");
            var sum = sums[key];
            sum["0"] = key;
            for (var index in sum) {
                var td = $("<td>");
                if (index !== "0") {
                    td.addClass('format');
                }
                td.text(sum[index]);
                //mark if this team  "won" this category
                var other = (key === "Radiant") ? "Dire" : "Radiant";
                var greaterThan = sum[index] > sums[other][index];
                //invert if a negative category
                greaterThan = negatives[index] ? sum[index] < sums[other][index] : greaterThan;
                if (greaterThan) {
                    td.addClass((key === "Radiant") ? 'success' : 'danger');
                }
                tr.append(td);
            }
            tfoot.append(tr);
        }
        $(table).append(tfoot);
    });
    var classes = ["progress-bar-success", "progress-bar-danger", "progress-bar-warning", "progress-bar-info"];
    $("table.rankable").each(function() {
        var table = $(this);
        table.first("tr").find("th").each(function(columnIndex) {
            var maxValue = 0;
            var currentValue = 0;
            var $trs = table.find("tr");
            //first pass, get the max
            $trs.each(function(index, element) {
                var $td = $(element).find("td:eq(" + columnIndex + ")");
                currentValue = parseFloat($td.text() || $td.attr("data-format-seconds") || $td.attr("data-value"));
                if (currentValue > maxValue && $td.hasClass("rankable")) {
                    maxValue = currentValue;
                }
            });
            //second pass, create the bars
            $trs.each(function(index, element) {
                var $td = $(element).find("td:eq(" + columnIndex + ")");
                currentValue = parseFloat($td.text() || $td.attr("data-format-seconds") || $td.attr("data-value"));
                if ($td.hasClass("rankable")) {
                    //console.log(currentValue, maxValue);
                    var pct = currentValue / maxValue * 100;
                    var bar = document.createElement("div");
                    bar.className = "progress progress-short";
                    var innerBar = document.createElement("div");
                    innerBar.className = "progress-bar " + classes[columnIndex % classes.length];
                    innerBar.style.width = pct + "%";
                    bar.appendChild(innerBar);
                    //create a new child div with format class name preserved
                    var textdiv = document.createElement("div");
                    textdiv.innerHTML = $td.text();
                    textdiv.className = $td.attr('class');
                    $td.removeClass();
                    $td.html(textdiv.outerHTML + bar.outerHTML);
                }
            });
        });
    });
    $('.format').each(function() {
        var orig = $(this).text();
        if (orig) {
            var result = format(orig);
            $(this).text(result);
        }
    });
    $('.format-seconds').each(function() {
        //format the data attribute rather than the text so we don't lose the original value if we want to reformat (like when paging in datatables)
        $(this).text(formatSeconds($(this).attr('data-format-seconds') || $(this).text()));
    });
    //disable clicks on disabled elements
    $('.disabled').click(function() {
        return false;
    });
}