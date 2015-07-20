module.exports = function timeline(objectives) {
    const items = [];
    objectives.forEach((entry) => {
        const bar = {};
        const time = window.formatSeconds(entry.time);
        const img = entry.hero_img ? `<img src='` + entry.hero_img + `' width=30 />` : entry.team ? 'The Dire' : 'The Radiant';
        bar.start = moment().startOf('day').seconds(entry.time).toDate();
        bar.content = `<div style='font-size:10px;'>` + img + entry.objective + time + `</div>`;
        bar.group = entry.team;
        items.push(bar);
    });
    // TODO set backgrounds as additional items pushed
    const groups = [
        {
            id: 0,
            content: 'Radiant'
        }, {
            id: 1,
            content: 'Dire'
        }
    ];
    // create visualization
    const container = document.getElementById('timeline');
    const options = {
        zoomable: false,
        moveable: false,
        showCurrentTime: false,
        // TODO adjust start/end based on duration or max event?
        start: moment().startOf('day').subtract(180, 'seconds'),
        end: moment().startOf('day').seconds(objectives[objectives.length - 1].time).add(180, 'seconds'),
        showMajorLabels: false
        // showMinorLabels: false
    };
    const timeLine = new vis.Timeline(container);
    timeLine.setOptions(options);
    timeLine.setItems(items);
    timeLine.setGroups(groups);
    console.log(items);
};
