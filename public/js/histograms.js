function hsv2rgb(h, s, v) {
    // adapted from http://schinckel.net/2012/01/10/hsv-to-rgb-in-javascript/
    let rgb;
    let i;
    let data = [];
    if (s === 0) {
        rgb = [v, v, v];
    } else {
        i = Math.floor(h / 60);
        data = [v * (1 - s), v * (1 - s * (h - i)), v * (1 - s * (1 - (h - i)))];
        switch (i) {
            case 0:
                rgb = [v, data[2], data[0]];
                break;
            case 1:
                rgb = [data[1], v, data[0]];
                break;
            case 2:
                rgb = [data[0], v, data[2]];
                break;
            case 3:
                rgb = [data[0], data[1], v];
                break;
            case 4:
                rgb = [data[2], data[0], v];
                break;
            default:
                rgb = [v, data[0], data[1]];
                break;
        }
    }
    return '#' + rgb.map((x) => ('0' + Math.round(x * 255).toString(16)).slice(-2)).join('');
}


function computeColor(color, d, source) {
    if (d.index !== undefined) {
        const pct = source[d.index] && source[d.index].win ? source[d.index].win / source[d.index].games : 0;
        // 0 is red and 120 is green, scale by pct
        // we probably want to scale so 0.4- is 0 and 0.6+ is 1
        const min = 0.3;
        const max = 0.7;
        const range = (max - min);
        const clamp = Math.max(min, Math.min(pct, max));
        const pctt = (clamp - min) / range;
        const h = Math.floor(120 * pctt);
        // can use standard saturation of 1
        const s = 1;
        // value/brightness can be 1
        const v = 1;
        const col = hsv2rgb(h, s, v);
        return col;
        // return pct < 0.5 ? "#d9534f" : "#5cb85c"
    } else {
        return color;
    }
}

module.exports = function createHistogram(counts, winCounts, label) {
    // counts, the number of matches with a value in each key
    // winCounts, the number of wins with a value in each key
    // create a hash of the categories/buckets to wins/games data
    let max;
    if (label === 'day') {
        max = 7;
    } else if (label === 'hour') {
        max = 24;
    } else if (label === 'month') {
        max = 12;
    } else {
        // figure out the max to determine how many bins we should have
        // increment the max by 1 to account for zero bucket
        max = Math.max.apply(null, Object.keys(counts).map((c) => Number(c))) + 1;
    }
    // cap the number of bins
    const bins = ~~Math.min(40, max);
    // param to scale the x-axis by, e.g., gpms are divided by 10 for binning, durations divided by 60
    const scalef = bins / max;
    // prefill hash with number of bins
    const hash = {};
    for (let i = 0; i < bins; i++) {
        hash[i] = {
            win: 0,
            games: 0
        };
    }
    // we need to further bucket the counts
    for (let key in counts) {
        let bucket;
        if (label === 'day') {
            bucket = moment(key, 'X').day();
        } else if (label === 'hour') {
            bucket = moment(key, 'X').hour();
        } else if (label === 'month') {
            bucket = moment(key, 'X').month();
        } else {
            bucket = ~~(Number(key) * scalef);
        }
        if (hash[bucket]) {
            // protect against glitchy negative values
            // console.log(label, key, bucket)
            hash[bucket].win += winCounts[key];
            hash[bucket].games += counts[key];
        }
    }
    // console.log(hash);
    // each histogram needs array of magnitudes for heights
    const data = ['Matches'];
    for (let key in hash) {
        data.push(hash[key].games);
    }
    const options = {
        bindto: '#chart-histogram-' + label,
        data: {
            columns: [data],
            type: 'bar',
            color: function(color, d) {
                return computeColor(color, d, hash);
            },
            labels: {
                format: function(v, id, ind, j) {
                    return (hash[ind] && hash[ind].win ? hash[ind].win / hash[ind].games * 100 : 0).toFixed(0) + '%';
                }
            }
        },
        bar: {
            width: {
                ratio: 0.9
            }
        },
        axis: {
            x: {
                // TODO: make a better label out of the key
                // label: label,
                tick: {
                    format: function(t) {
                        // readjust the tick value by the scale factor for display
                        const tt = Number(t) / scalef;
                        // these labels are times and need to be formatted
                        const times = {
                            duration: 1,
                            first_blood_time: 1
                        };
                        if (times[label]) {
                            return moment().startOf('day').seconds(t).format('H:mm:ss');
                        }
                        return tt.toFixed(0);
                    }
                }
            },
            y: {
                // label: 'Matches'
            }
        },
        tooltip: {
            format: {
                value: function(value, ratio, id, ind) {
                    return value + ' (' + (hash[ind] && hash[ind].win ? hash[ind].win / hash[ind].games * 100 : 0).toFixed(2) + '% won)';
                }
            }
        }
    };
    if (label === 'day') {
        // format x
        options.axis.x = {
            type: 'category',
            categories: moment.weekdays()
        };
    } else if (label === 'hour') {
        // format x
        options.axis.x = {
            type: 'category',
            // make copy of data without the first element and create array of formatted times (1am, 2am...)
            categories: data.slice(1).map(function(e, i) {
                return moment().startOf('day').hours(i).format('ha');
            })
        };
    } else if (label === 'month') {
        options.axis.x = {
            type: 'category',
            categories: moment.months()
        };
    }
    c3.generate(options);
};
