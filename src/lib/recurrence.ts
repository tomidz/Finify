/**
 * The dates (yyyy-MM-dd) a recurrence falls on in a calendar month. `startDate`
 * anchors biweekly cycles, quarterly months and the defaults for a missing day;
 * callers drop dates outside the recurrence's start/end window.
 */
export function getExpectedDatesInMonth(
  recurrence: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null,
  year: number,
  month: number,
  startDate: Date
): string[] {
  const dates: string[] = [];
  const lastDay = new Date(year, month, 0).getDate();

  switch (recurrence) {
    case "monthly": {
      const day = Math.min(dayOfMonth ?? startDate.getDate(), lastDay);
      dates.push(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      );
      break;
    }
    case "weekly": {
      const dow = dayOfWeek ?? startDate.getDay();
      // Find all occurrences of this day-of-week in the month
      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month - 1, d);
        if (date.getDay() === dow) {
          dates.push(
            `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
          );
        }
      }
      break;
    }
    case "biweekly": {
      // True 14-day cycle anchored on start_date (not "every other weekday in
      // the calendar month", which drifts across month boundaries).
      const monthStart = new Date(year, month - 1, 1);
      const cursor = new Date(startDate);
      while (cursor < monthStart) {
        cursor.setDate(cursor.getDate() + 14);
      }
      while (cursor.getFullYear() === year && cursor.getMonth() === month - 1) {
        dates.push(
          `${year}-${String(month).padStart(2, "0")}-${String(
            cursor.getDate()
          ).padStart(2, "0")}`
        );
        cursor.setDate(cursor.getDate() + 14);
      }
      break;
    }
    case "quarterly": {
      // Recur every 3 months from the start month
      const startM = startDate.getMonth() + 1; // 1-based
      const quarterMonths: number[] = [];
      for (let m = startM; m <= 12; m += 3) quarterMonths.push(m);
      for (let m = startM - 3; m >= 1; m -= 3) quarterMonths.push(m);
      if (quarterMonths.includes(month)) {
        const day = Math.min(dayOfMonth ?? startDate.getDate(), lastDay);
        dates.push(
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        );
      }
      break;
    }
    case "yearly": {
      if (startDate.getMonth() + 1 === month) {
        const day = Math.min(dayOfMonth ?? startDate.getDate(), lastDay);
        dates.push(
          `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        );
      }
      break;
    }
  }

  return dates;
}

/** Convert any recurrence to a monthly equivalent */
export function toMonthlyAmount(amount: number, recurrence: string): number {
  switch (recurrence) {
    case "weekly":
      return amount * (52 / 12); // ~4.33 weeks per month
    case "biweekly":
      return amount * (26 / 12); // ~2.17 times per month
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    default:
      return amount;
  }
}
