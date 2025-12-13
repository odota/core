import moment from "moment";

export function getEndOfMonth() {
  return moment.utc().endOf("month").unix();
}
export function getEndOfWeek() {
  return moment.utc().endOf("week").unix();
}
export function getEndOfDay() {
  return moment.utc().endOf("day").unix();
}
export function getEndOfHour() {
  return moment.utc().endOf("hour").unix();
}

/**
 * Returns the unix timestamp at the beginning of a block of n minutes
 * Offset controls the number of blocks to look ahead
 * */
export function getStartOfBlockMinutes(size: number, offset: number) {
  offset = offset || 0;
  const blockS = size * 60;
  const curTime = Math.floor(Date.now() / 1000);
  const blockStart = curTime - (curTime % blockS);
  return (blockStart + offset * blockS).toFixed(0);
}
