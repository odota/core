window.buildMap = function buildMap() {
    var buildingData = [{
        id: "t4br",
        style: "position: absolute; top: 78%; left: 17%;"
        }, {
        id: "t4tr",
        style: "position: absolute; top: 77%; left: 15%;"
        }, {
        id: "t3br",
        style: "position: absolute; top: 86%; left: 26%;"
        }, {
        id: "t2br",
        style: "position: absolute; top: 86%; left: 46%;"
        }, {
        id: "t1br",
        style: "position: absolute; top: 86%; left: 80%;"
        }, {
        id: "t3mr",
        style: "position: absolute; top: 72%; left: 22%;"
        }, {
        id: "t2mr",
        style: "position: absolute; top: 64%; left: 30%;"
        }, {
        id: "t1mr",
        style: "position: absolute; top: 56%; left: 40%;"
        }, {
        id: "t3tr",
        style: "position: absolute; top: 67%; left: 9%;"
        }, {
        id: "t2tr",
        style: "position: absolute; top: 52%; left: 11%;"
        }, {
        id: "t1tr",
        style: "position: absolute; top: 39%; left: 11%;"
        }, {
        id: "brbr",
        style: "position: absolute; top: 85%; left: 24%;"
        }, {
        id: "bmbr",
        style: "position: absolute; top: 87%; left: 24%;"
        }, {
        id: "brmr",
        style: "position: absolute; top: 72.5%; left: 20%;"
        }, {
        id: "bmmr",
        style: "position: absolute; top: 73.5%; left: 21.5%;"
        }, {
        id: "brtr",
        style: "position: absolute; top: 69%; left: 8%;"
        }, {
        id: "bmtr",
        style: "position: absolute; top: 69%; left: 10%;"
        }, {
        id: "t4bd",
        style: "position: absolute; top: 19%; left: 83%;"
        }, {
        id: "t4td",
        style: "position: absolute; top: 18%; left: 81%;"
        }, {
        id: "t3bd",
        style: "position: absolute; top: 31%; left: 87%;"
        }, {
        id: "t2bd",
        style: "position: absolute; top: 45%; left: 87%;"
        }, {
        id: "t1bd",
        style: "position: absolute; top: 60%; left: 87%;"
        }, {
        id: "t3md",
        style: "position: absolute; top: 27%; left: 73%;"
        }, {
        id: "t2md",
        style: "position: absolute; top: 37%; left: 63%;"
        }, {
        id: "t1md",
        style: "position: absolute; top: 47%; left: 53%;"
        }, {
        id: "t3td",
        style: "position: absolute; top: 13%; left: 70%;"
        }, {
        id: "t2td",
        style: "position: absolute; top: 13%; left: 50%;"
        }, {
        id: "t1td",
        style: "position: absolute; top: 13%; left: 20%;"
        }, {
        id: "brbd",
        style: "position: absolute; top: 29%; left: 86%;"
        }, {
        id: "bmbd",
        style: "position: absolute; top: 29%; left: 88%;"
        }, {
        id: "brmd",
        style: "position: absolute; top: 25%; left: 74%;"
        }, {
        id: "bmmd",
        style: "position: absolute; top: 26%; left: 75%;"
        }, {
        id: "brtd",
        style: "position: absolute; top: 12%; left: 72%;"
        }, {
        id: "bmtd",
        style: "position: absolute; top: 14%; left: 72%;"
        }, {
        id: "ar",
        style: "position: absolute; top: 79%; left: 12%;"
        }, {
        id: "ad",
        style: "position: absolute; top: 14%; left: 83%;"
        }];
    var bits = pad(Number($('#map').attr('data-tower-radiant')).toString(2), 11);
    bits += pad(Number($('#map').attr('data-barracks-radiant')).toString(2), 6);
    bits += pad(Number($('#map').attr('data-tower-dire')).toString(2), 11);
    bits += pad(Number($('#map').attr('data-barracks-dire')).toString(2), 6);
    bits += $('#map').attr('data-radiant-win') === "1" ? "10" : "01";
    //concat, iterate through bits of all four status values
    //if 1, create image
    //building data in correct order
    //determine ancient display by match winner
    for (var i = 0; i < bits.length; i++) {
        var d = buildingData[i];
        d.src = 'https://raw.githubusercontent.com/kronusme/dota2-api/master/images/map/';
        d.src += buildingData[i].id.slice(0, 1) === "t" ? 'tower' : 'racks';
        d.src += buildingData[i].id.slice(-1) === "r" ? '_radiant.png' : '_dire.png';
        d.class = buildingData[i].id.slice(0, 1) === "a" ? "" : "icon";
        d.style += bits[i] === "1" ? "" : "opacity: 0.2;";
        d.style += "zoom: "+document.getElementById("map").clientWidth/600+";";
        $('#map').append(($('<img>', d)));
    }
}
