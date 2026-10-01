/**
 * Proleptic Gregorian calendar arithmetic with astronomical year
 * numbering, as in XSD 1.1 (year 0000 is 1 BCE and is a leap year).
 *
 * @module @tradik/xslt3/xdm/calendar
 */

/**
 * @param {number} year
 * @returns {boolean} whether the year is a leap year
 */
export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * @param {number} year
 * @param {number} month - 1 to 12
 * @returns {number} number of days in the month
 */
export function daysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : monthLengths[month - 1];
}

/**
 * Days since 1970-01-01 of a civil date (H. Hinnant's algorithm).
 * @param {number} year
 * @param {number} month - 1 to 12
 * @param {number} day - 1 to 31
 * @returns {number}
 */
export function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/**
 * Civil date of a day number (inverse of {@link daysFromCivil}).
 * @param {number} days - Days since 1970-01-01
 * @returns {[number, number, number]} [year, month, day]
 */
export function civilFromDays(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day];
}
