export type CountryCode = "IT";

// Fixed Italian national holidays: MM-DD format
const ITALY_FIXED_HOLIDAYS = [
  "01-01", // Capodanno
  "01-06", // Epifania
  "04-25", // Festa della Liberazione
  "05-01", // Festa del Lavoro
  "06-02", // Festa della Repubblica
  "08-15", // Ferragosto
  "11-01", // Ognissanti
  "12-08", // Immacolata Concezione
  "12-25", // Natale
  "12-26", // Santo Stefano
];

const mmdd = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
};

const isItalyHoliday = (d: Date): boolean =>
  ITALY_FIXED_HOLIDAYS.includes(mmdd(d));

export const isWorkingDay = (d: Date, countryCode: CountryCode): boolean => {
  if (countryCode === "IT") {
    // Sunday (0) is non-working; Saturday (6) is working
    if (d.getDay() === 0) return false;
    if (isItalyHoliday(d)) return false;
    return true;
  }
  return d.getDay() !== 0;
};

export const nextWorkingDay = (d: Date, countryCode: CountryCode): Date => {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  while (!isWorkingDay(next, countryCode)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

export const assignDates = (
  dayCount: number,
  startDate: Date,
  countryCode: CountryCode,
): Date[] => {
  const dates: Date[] = [];
  let current = new Date(startDate);
  // Advance to first working day if startDate itself is not working
  while (!isWorkingDay(current, countryCode)) {
    current.setDate(current.getDate() + 1);
  }
  for (let i = 0; i < dayCount; i++) {
    dates.push(new Date(current));
    current = nextWorkingDay(current, countryCode);
  }
  return dates;
};
