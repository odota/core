module.exports = function formatHtml() {
    $('table.summable').each(function(i, table) {
        // iterate through rows
        const sums = {
            Radiant: {},
            Dire: {}
        };
        const negatives = {};
        const tbody = $(table).find('tbody');
        tbody.children().each(function(i, row) {
            const rowNode = $(row);
            const target = (rowNode.hasClass('success')) ? sums.Radiant : sums.Dire;
            // iterate through cells
            rowNode.children().each(function(j, cell) {
                const cellNode = $(cell);
                if (!target[j]) {
                    target[j] = 0;
                }
                negatives[j] = cellNode.hasClass('negative');
                const content = cellNode.clone() // clone the element
                    .children() // select all the children
                    .remove() // remove all the children
                    .end() // again go back to selected element
                    .text();
                // todo support stuff like % symbols
                target[j] += Number(content) || 0;
            });
        });
        // console.log(sums, negatives)
        // add sums to table
        const tfoot = $('<tfoot>');
        for (let key in sums) {
            const tr = $('<tr>');
            const sum = sums[key];
            sum['0'] = key;
            for (let index in sum) {
                const td = $('<td>');
                if (index !== '0') {
                    td.addClass('format');
                }
                td.text(sum[index]);
                // mark if this team "won" this category
                const other = (key === 'Radiant') ? 'Dire' : 'Radiant';
                // invert if a negative category
                const greaterThan = negatives[index] ?
                    sum[index] < sums[other][index] : sum[index] > sums[other][index];
                if (greaterThan) {
                    td.addClass((key === 'Radiant') ? 'success' : 'danger');
                }
                tr.append(td);
            }
            tfoot.append(tr);
        }
        $(table).append(tfoot);
    });
    $('.format').each(function() {
        const orig = $(this).text();
        const result = window.format(orig);
        // don't reformat since it's not a number anymore
        $(this).text(result).removeClass('format');
    });
    $('.format-seconds').each(function() {
        // format the data attribute rather than the text so we don't lose the original value if we want to reformat (like when paging in datatables)
        $(this).text(window.formatSeconds($(this).attr('data-format-seconds')));
    });
    // disable clicks on disabled elements
    $('.disabled').click(function() { return false; });
};
