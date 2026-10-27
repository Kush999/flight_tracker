export type Flight = {
  id: string;
  scheduledArrival: string | null;
  estimatedArrival: string | null;
  flightNumber: string | null;
  airline: string | null;
  originAirport: string | null;
  originCode: string | null;
  originCity: string | null;
  originCountry: string | null;
  originCountryCode: string | null;
  terminal: string | null;
  status: string | null;
  isTerminal1: boolean | null;
  isInternational: boolean | null;
  isUsOrigin: boolean | null;
};

export type DashboardPayload = {
  targetDate: string;
  fetchedAt: string;
  flights: Flight[];
  source: "live" | "cache";
  truncated: boolean;
};

export type AirportReference = { name: string | null; city: string | null; countryCode: string };
export type AirportReferenceResolver = (iata: string | null, icao: string | null) => AirportReference | null;

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" ? value as UnknownRecord : {};
const string = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const firstString = (...values: unknown[]): string | null => values.map(string).find(Boolean) ?? null;

export function tomorrowInToronto(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function isProviderFutureDateAllowed(targetDate: string, now: Date = new Date()): boolean {
  const nextUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const earliest = `${nextUtcDay.getUTCFullYear()}-${String(nextUtcDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextUtcDay.getUTCDate()).padStart(2, "0")}`;
  const latestDate = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
  const latest = `${latestDate.getUTCFullYear()}-${String(latestDate.getUTCMonth() + 1).padStart(2, "0")}-${String(latestDate.getUTCDate()).padStart(2, "0")}`;
  return targetDate >= earliest && targetDate <= latest;
}

export function normalizeFlights(input: unknown, resolveAirport?: AirportReferenceResolver, countryNameForCode?: (code: string | null) => string | null): Flight[] {
  const data = record(input).data;
  if (!Array.isArray(data)) throw new Error("The flight provider returned an unexpected response.");
  return data.map((raw, index) => {
    const item = record(raw);
    const departure = record(item.departure);
    const arrival = record(item.arrival);
    const airline = record(item.airline);
    const flight = record(item.flight);
    const terminal = firstString(arrival.terminal);
    const originCode = firstString(departure.iataCode);
    const originIcao = firstString(departure.icaoCode);
    const airport = resolveAirport?.(originCode, originIcao) ?? null;
    const originCountryCode = firstString(departure.countryCode, departure.country_code, airport?.countryCode);
    const originCountry = firstString(departure.countryName, departure.country, countryNameForCode?.(originCountryCode));
    const normalizedCode = terminal?.toUpperCase().replace(/\s+/g, "");
    const isTerminal1 = normalizedCode === "1" || normalizedCode === "T1" ? true : terminal ? false : null;
    const countryCode = originCountryCode?.toUpperCase();
    const namedCountry = originCountry?.toLowerCase();
    const isInternational = countryCode ? !["CA", "CAN"].includes(countryCode) : namedCountry ? !["canada"].includes(namedCountry) : null;
    const isUsOrigin = countryCode ? ["US", "USA"].includes(countryCode) : namedCountry ? ["united states", "united states of america"].includes(namedCountry) : null;
    const flightNumber = firstString(flight.iataNumber, flight.number);
    return {
      id: flightNumber ?? `${originCode ?? "unknown"}-${firstString(arrival.scheduledTime) ?? index}`,
      scheduledArrival: firstString(arrival.scheduledTime),
      estimatedArrival: firstString(arrival.estimatedTime),
      flightNumber,
      airline: firstString(airline.name, airline.iataCode),
      originAirport: firstString(departure.airportName, departure.airport, airport?.name),
      originCode,
      originCity: firstString(departure.city, airport?.city),
      originCountry,
      originCountryCode,
      terminal,
      status: firstString(item.status, item.flight_status),
      isTerminal1,
      isInternational,
      isUsOrigin,
    };
  });
}

export function filterFlights(flights: Flight[], excludeUs: boolean): Flight[] {
  return flights.filter((flight) => flight.isInternational === true && flight.isTerminal1 === true && !(excludeUs && flight.isUsOrigin === true))
    .sort((a, b) => {
      if (!a.scheduledArrival) return 1;
      if (!b.scheduledArrival) return -1;
      return a.scheduledArrival.localeCompare(b.scheduledArrival);
    });
}

export function countUnverified(flights: Flight[]): number {
  return flights.filter((flight) => flight.isInternational === null || flight.isTerminal1 === null).length;
}
