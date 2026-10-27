export type Flight = {
  id: string;
  flightDate: string | null;
  scheduledArrival: string | null;
  estimatedArrival: string | null;
  actualArrival: string | null;
  flightNumber: string | null;
  airline: string | null;
  originAirport: string | null;
  originCode: string | null;
  originCity: string | null;
  originCountry: string | null;
  originCountryCode: string | null;
  terminal: string | null;
  status: string | null;
  arrivalCode: string | null;
  isYyz: boolean | null;
  isTerminal1: boolean | null;
  isInternational: boolean | null;
  isUsOrigin: boolean | null;
};

export type DashboardPayload = {
  flightDate: string;
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

export function todayInToronto(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Aviationstack's YYZ schedule timestamps carry a +00:00 suffix, but their
 * wall-clock values match Pearson's published Toronto-local schedule times.
 * Use the schedule's date component as the YYZ arrival date instead of
 * converting that misleading offset as an instant.
 */
export function arrivalDateInToronto(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}/);
  return match?.[1] ?? null;
}

export function arrivalClockForDisplay(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/);
  return match?.[1] ?? null;
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
    const originCode = firstString(departure.iata);
    const originIcao = firstString(departure.icao);
    const airport = resolveAirport?.(originCode, originIcao) ?? null;
    const originCountryCode = firstString(departure.countryCode, departure.country_code, airport?.countryCode);
    const originCountry = firstString(departure.countryName, departure.country, countryNameForCode?.(originCountryCode));
    const normalizedCode = terminal?.toUpperCase().replace(/\s+/g, "");
    const isTerminal1 = normalizedCode === "1" || normalizedCode === "T1" ? true : terminal ? false : null;
    const countryCode = originCountryCode?.toUpperCase();
    const namedCountry = originCountry?.toLowerCase();
    const isInternational = countryCode ? !["CA", "CAN"].includes(countryCode) : namedCountry ? !["canada"].includes(namedCountry) : null;
    const isUsOrigin = countryCode ? ["US", "USA"].includes(countryCode) : namedCountry ? ["united states", "united states of america"].includes(namedCountry) : null;
    const flightNumber = firstString(flight.iata);
    const arrivalCode = firstString(arrival.iata);
    return {
      id: flightNumber ?? `${originCode ?? "unknown"}-${firstString(arrival.scheduled) ?? index}`,
      flightDate: firstString(item.flight_date),
      scheduledArrival: firstString(arrival.scheduled),
      estimatedArrival: firstString(arrival.estimated),
      actualArrival: firstString(arrival.actual),
      flightNumber,
      airline: firstString(airline.name, airline.iata),
      originAirport: firstString(departure.airportName, departure.airport, airport?.name),
      originCode,
      originCity: firstString(departure.city, airport?.city),
      originCountry,
      originCountryCode,
      terminal,
      status: firstString(item.status, item.flight_status),
      isTerminal1,
      arrivalCode,
      isYyz: arrivalCode ? arrivalCode.toUpperCase() === "YYZ" : null,
      isInternational,
      isUsOrigin,
    };
  });
}

export function filterFlights(flights: Flight[], excludeUs: boolean): Flight[] {
  return flights.filter((flight) => flight.isYyz === true && flight.isInternational === true && flight.isTerminal1 === true && !(excludeUs && flight.isUsOrigin === true))
    .sort((a, b) => {
      const aTime = a.scheduledArrival ? Date.parse(a.scheduledArrival) : Number.NaN;
      const bTime = b.scheduledArrival ? Date.parse(b.scheduledArrival) : Number.NaN;
      if (Number.isNaN(aTime)) return Number.isNaN(bTime) ? 0 : 1;
      if (Number.isNaN(bTime)) return -1;
      return aTime - bTime;
    });
}

export function countUnverified(flights: Flight[]): number {
  return flights.filter((flight) => flight.isYyz !== false && (flight.isYyz === null || flight.isInternational === null || flight.isTerminal1 === null)).length;
}
