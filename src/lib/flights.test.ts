import { describe, expect, it } from "vitest";
import { countUnverified, filterFlights, isProviderFutureDateAllowed, normalizeFlights, tomorrowInToronto } from "@/lib/flights";
import { providerErrorFor } from "@/lib/aviationstack";

describe("tomorrowInToronto", () => {
  it("uses Toronto's local calendar date rather than the UTC date", () => {
    expect(tomorrowInToronto(new Date("2026-10-27T02:30:00.000Z"))).toBe("2026-10-27"); // still Oct 26 in Toronto
  });
  it("increments the local calendar date safely over a daylight-saving boundary", () => {
    expect(tomorrowInToronto(new Date("2026-03-08T04:30:00.000Z"))).toBe("2026-03-08"); // Mar 7 in Toronto
  });
  it("handles the Toronto midnight boundary", () => {
    expect(tomorrowInToronto(new Date("2026-10-27T04:15:00.000Z"))).toBe("2026-10-28");
  });
  it("recognizes the brief Toronto-to-UTC window when local tomorrow is provider-today", () => {
    expect(isProviderFutureDateAllowed(tomorrowInToronto(new Date("2026-03-08T02:00:00.000Z")), new Date("2026-03-08T02:00:00.000Z"))).toBe(false);
    expect(isProviderFutureDateAllowed(tomorrowInToronto(new Date("2026-03-08T05:00:00.000Z")), new Date("2026-03-08T05:00:00.000Z"))).toBe(true);
  });
});

const flight = (overrides: Record<string, unknown> = {}) => ({
  departure: { iataCode: "LHR", countryCode: "GB", countryName: "United Kingdom" },
  arrival: { iataCode: "YYZ", scheduledTime: "2026-10-27 14:35:00", terminal: "1" },
  airline: { name: "Example Air" }, flight: { iataNumber: "EX123" }, ...overrides,
});

describe("normalizeFlights and filters", () => {
  it("normalizes future schedule values and recognizes Terminal 1 forms", () => {
    const rows = normalizeFlights({ data: [flight(), flight({ arrival: { iataCode: "YYZ", terminal: "T1" } })] });
    expect(rows.map((row) => row.isTerminal1)).toEqual([true, true]);
    expect(rows[0]).toMatchObject({ isInternational: true, originCountry: "United Kingdom", status: null, estimatedArrival: null });
  });
  it("excludes Canadian domestic origins from international arrivals", () => {
    const rows = normalizeFlights({ data: [flight(), flight({ departure: { iataCode: "YVR", countryCode: "CA" } })] });
    expect(filterFlights(rows, false).map((row) => row.originCode)).toEqual(["LHR"]);
  });
  it("includes US origins by default and can exclude them", () => {
    const rows = normalizeFlights({ data: [flight(), flight({ departure: { iataCode: "JFK", countryCode: "US" } })] });
    expect(filterFlights(rows, false)).toHaveLength(2);
    expect(filterFlights(rows, true).map((row) => row.originCode)).toEqual(["LHR"]);
  });
  it("uses airport-code reference data when the provider omits origin country", () => {
    const rows = normalizeFlights({ data: [flight({ departure: { iataCode: "NRT" } })] }, (iata) => iata === "NRT" ? { name: "Narita International Airport", city: "Narita", countryCode: "JP" } : null, (code) => code === "JP" ? "Japan" : null);
    expect(rows[0]).toMatchObject({ originAirport: "Narita International Airport", originCity: "Narita", originCountry: "Japan", originCountryCode: "JP", isInternational: true });
    expect(filterFlights(rows, false)).toHaveLength(1);
  });
  it("keeps missing country or terminal unverified instead of guessing", () => {
    const rows = normalizeFlights({ data: [flight({ departure: { iataCode: "NRT" } }), flight({ departure: { iataCode: "HND" }, arrival: { iataCode: "YYZ" } })] });
    expect(rows.map((row) => [row.isInternational, row.isTerminal1])).toEqual([[null, true], [null, null]]);
    expect(countUnverified(rows)).toBe(2);
    expect(filterFlights(rows, false)).toHaveLength(0);
  });
  it("does not assume unknown terminal is Terminal 1", () => {
    expect(normalizeFlights({ data: [flight({ arrival: { terminal: "2" } })] })[0].isTerminal1).toBe(false);
  });
  it("sorts by scheduled arrival and puts missing times last", () => {
    const rows = normalizeFlights({ data: [flight({ flight: { iataNumber: "LATE" }, arrival: { terminal: "1", scheduledTime: "2026-10-27 18:00:00" } }), flight({ flight: { iataNumber: "EARLY" }, arrival: { terminal: "1", scheduledTime: "2026-10-27 08:00:00" } }), flight({ flight: { iataNumber: "UNTIMED" }, arrival: { terminal: "1" } })] });
    expect(filterFlights(rows, false).map((row) => row.flightNumber)).toEqual(["EARLY", "LATE", "UNTIMED"]);
  });
  it("rejects a malformed provider collection", () => {
    expect(() => normalizeFlights({ data: "not-an-array" })).toThrow("unexpected response");
  });
  it("maps provider authentication, plan, and rate errors to safe messages", () => {
    expect(providerErrorFor(401).kind).toBe("auth");
    expect(providerErrorFor(403, "function_access_restricted").kind).toBe("restricted");
    expect(providerErrorFor(429).message).toMatch(/limit reached/);
  });
});
