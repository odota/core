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
    $('.format').each(function() {
        var orig = $(this).text();
        var result = format(orig);
        //don't reformat since it's not a number anymore
        $(this).text(result).removeClass("format");
    });
    $('.format-seconds').each(function() {
        //format the data attribute rather than the text so we don't lose the original value if we want to reformat (like when paging in datatables)
        $(this).text(formatSeconds($(this).attr('data-format-seconds')));
    });
    //disable clicks on disabled elements
    $('.disabled').click(function() { return false; });
}