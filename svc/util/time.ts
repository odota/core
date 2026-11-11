const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function fromNow(date: number | Date) {
  const ms =
    typeof date === "number" && date < 1e11 ? date * 1000 : Number(date);
  const diffSec = (ms - Date.now()) / 1000;
  for (const [unit, sec] of units) {
    if (Math.abs(diffSec) >= sec || unit === "second") {
      return rtf.format(Math.round(diffSec / sec), unit);
    }
  }
  return "";
}

export function getStartOfMonth(offsetMonths = 0, d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
}

export function getEndOfMonth(offsetMonths = 0, d = new Date()) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths + 1, 0, 23, 59, 59, 999),
  );
}

export function getMonthRange(d = new Date()) {
  return [
    getStartOfMonth(0, d).toISOString().slice(0, 10),
    getEndOfMonth(0, d).toISOString().slice(0, 10),
  ];
}

export function getEndOfWeek() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
  d.setUTCHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

export function getEndOfDay() {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Returns the unix timestamp at the beginning of a block of n minutes
 * Offset controls the number of blocks to look ahead
 * */
export function getStartOfBlockMinutes(size: number, offset = 0) {
  const blockS = size * 60;
  const curTime = Math.floor(Date.now() / 1000);
  const blockStart = curTime - (curTime % blockS);
  return (blockStart + offset * blockS).toFixed(0);
}
