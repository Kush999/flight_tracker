import airportRows from "@/data/airport-reference.json";

export type AirportReference = {
  name: string | null;
  city: string | null;
  countryCode: string;
};

const airports = airportRows as Record<string, AirportReference>;
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

export function resolveAirport(iata: string | null): AirportReference | null {
  return iata ? airports[iata.toUpperCase()] ?? null : null;
}

export function countryNameForCode(code: string | null): string | null {
  if (!code) return null;
  try {
    const name = countryNames.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : null;
  } catch {
    return null;
  }
}
