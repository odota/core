/**
 * Creates a 2D array of lane mappings (x,y) to lane constant IDs
 * */
const laneMappings = [];
for (let i = 0; i < 128; i += 1) {
  laneMappings.push([]);
  for (let j = 0; j < 128; j += 1) {
    let lane;
    if (Math.abs(i - (127 - j)) < 8) {
      lane = 2; // mid
    } else if (j < 27 || i < 27) {
      lane = 3; // top
    } else if (j >= 100 || i >= 100) {
      lane = 1; // bot
    } else if (i < 50) {
      lane = 5; // djung
    } else if (i >= 77) {
      lane = 4; // rjung
    } else {
      lane = 2; // mid
    }
    laneMappings[i].push(lane);
  }
}
module.exports = laneMappings;
