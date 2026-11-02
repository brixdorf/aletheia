/** Flows where dark patterns live, shown one at a time in the prompt box. */
export const AUDIT_EXAMPLES = [
  "Sign up for Adobe Creative Cloud and read the cancellation terms",
  "Book a hotel room in Goa on MakeMyTrip and stop at payment",
  "Start a Spotify Premium trial",
  "Buy two movie tickets on BookMyShow",
  "Choose a broadband plan on Airtel",
] as const;

export function exampleAt(tick: number): string {
  return AUDIT_EXAMPLES[tick % AUDIT_EXAMPLES.length] ?? AUDIT_EXAMPLES[0];
}
