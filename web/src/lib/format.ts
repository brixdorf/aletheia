const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

export function money(amount: number, currency: string | null): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  const value = amount.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: 2,
  });
  if (currency === null) return value;
  return `${currency === "INR" ? "Rs" : currency} ${value}`;
}

export function clock(iso: string): string {
  // Newer Intl data puts a narrow no-break space before AM and PM.
  return TIME.format(new Date(iso)).replaceAll(" ", " ");
}

export function dateTime(iso: string): string {
  return `${DAY.format(new Date(iso))}, ${clock(iso)}`;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
