function invalidDate(): never {
  throw new RangeError(
    "Invalid date format or value. Use: YYYY-MM-DD, YYYY-MM-DDTHH:mm[:ss[.sss]][Z|±HH:mm], or HH:mm",
  );
}

export function dateArgument(argument: string): Date {
  const time = /^(\d{1,2}):(\d{2})$/.exec(argument);
  if (time) {
    const hours = Number(time[1]);
    const minutes = Number(time[2]);
    if (hours > 23 || minutes > 59) invalidDate();
    const today = new Date();
    today.setHours(hours, minutes, 0, 0);
    if (today.getHours() !== hours || today.getMinutes() !== minutes) invalidDate();
    return today;
  }

  const parts = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
    argument,
  );
  if (!parts) invalidDate();
  const [, calendarDate, hours, minutes, seconds, timezone] = parts;
  const day = new Date(`${calendarDate}T00:00:00Z`);
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== calendarDate) invalidDate();
  if (Number(hours ?? 0) > 23 || Number(minutes ?? 0) > 59 || Number(seconds ?? 0) > 59) invalidDate();
  const parsed = new Date(argument.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) invalidDate();
  if (
    hours !== undefined &&
    timezone === undefined &&
    (parsed.getHours() !== Number(hours) || parsed.getMinutes() !== Number(minutes))
  )
    invalidDate();
  return parsed;
}
