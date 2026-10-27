import { describe, expect, it } from "vitest";
import { countUnverified, filterFlights, normalizeFlights, todayInToronto } from "@/lib/flights";
import { providerErrorFor } from "@/lib/aviationstack";

describe("todayInToronto", () => {
  it("uses Toronto's local calendar date rather than the UTC date", () => {
    expect(todayInToronto(new Date("2026-10-27T02:30:00.000Z"))).toBe("2026-10-26");
  });
  it("returns the correct local date across a daylight-saving boundary", () => {
    expect(todayInToronto(new Date("2026-03-08T04:30:00.000Z"))).toBe("2026-03-07");
  });
  it("handles Toronto midnight", () => {
    expect(todayInToronto(new Date("2026-10-27T04:15:00.000Z"))).toBe("2026-10-27");
  });
});

const flight = (overrides: Record<string, unknown> = {}) => ({
  departure: { iata: "LHR", countryCode: "GB", countryName: "United Kingdom" },
  arrival: { iata: "YYZ", scheduled: "2026-10-27T14:35:00-04:00", terminal: "1" },
  airline: { name: "Example Air" }, flight: { iata: "EX123" }, flight_status: "active", ...overrides,
});

describe("normalizeFlights and filters", () => {
  it("normalizes live flight data and recognizes Terminal 1 forms", () => {
    const rows = normalizeFlights({ data: [flight(), flight({ arrival: { iata: "YYZ", terminal: "T1" } })] });
    expect(rows.map((row) => row.isTerminal1)).toEqual([true, true]);
    expect(rows[0]).toMatchObject({ isYyz: true, isInternational: true, originCountry: "United Kingdom", status: "active", estimatedArrival: null });
  });
  it("normalizes scheduled, estimated, actual times, flight number, and status", () => {
    const row = normalizeFlights({ data: [flight({ arrival: { iata: "YYZ", scheduled: "2026-10-27T14:00:00+00:00", estimated: "2026-10-27T14:20:00+00:00", actual: "2026-10-27T14:22:00+00:00", terminal: "T1" }, flight: { iata: "EX123" }, flight_status: "landed" })] })[0];
    expect(row).toMatchObject({ scheduledArrival: "2026-10-27T14:00:00+00:00", estimatedArrival: "2026-10-27T14:20:00+00:00", actualArrival: "2026-10-27T14:22:00+00:00", flightNumber: "EX123", status: "landed", isTerminal1: true });
  });
  it("excludes Canadian domestic origins from international arrivals", () => {
    const rows = normalizeFlights({ data: [flight(), flight({ departure: { iata: "YVR", countryCode: "CA" } })] });
    expect(filterFlights(rows, false).map((row) => row.originCode)).toEqual(["LHR"]);
  });
  it("includes US origins by default and can exclude them", () => {
    const rows = normalizeFlights({ data: [flight(), flight({ departure: { iata: "JFK", countryCode: "US" } })] });
    expect(filterFlights(rows, false)).toHaveLength(2);
    expect(filterFlights(rows, true).map((row) => row.originCode)).toEqual(["LHR"]);
  });
  it("uses airport-code reference data when the provider omits origin country", () => {
    const rows = normalizeFlights({ data: [flight({ departure: { iata: "NRT" } })] }, (iata) => iata === "NRT" ? { name: "Narita International Airport", city: "Narita", countryCode: "JP" } : null, (code) => code === "JP" ? "Japan" : null);
    expect(rows[0]).toMatchObject({ originAirport: "Narita International Airport", originCity: "Narita", originCountry: "Japan", originCountryCode: "JP", isInternational: true });
    expect(filterFlights(rows, false)).toHaveLength(1);
  });
  it("keeps missing country or terminal unverified instead of guessing", () => {
    const rows = normalizeFlights({ data: [flight({ departure: { iata: "NRT" } }), flight({ departure: { iata: "HND" }, arrival: { iata: "YYZ" } })] });
    expect(rows.map((row) => [row.isInternational, row.isTerminal1])).toEqual([[null, true], [null, null]]);
    expect(countUnverified(rows)).toBe(2);
    expect(filterFlights(rows, false)).toHaveLength(0);
  });
  it("does not assume unknown terminal is Terminal 1", () => {
    expect(normalizeFlights({ data: [flight({ arrival: { iata: "YYZ", terminal: "2" } })] })[0].isTerminal1).toBe(false);
  });
  it("requires the returned arrival airport to confirm YYZ", () => {
    const rows = normalizeFlights({ data: [flight({ arrival: { iata: "YTZ", terminal: "1" } }), flight({ arrival: { terminal: "1" } })] });
    expect(rows.map((row) => row.isYyz)).toEqual([false, null]);
    expect(filterFlights(rows, false)).toHaveLength(0);
    expect(countUnverified(rows)).toBe(1);
  });
  it("sorts by scheduled arrival and puts missing times last", () => {
    const rows = normalizeFlights({ data: [flight({ flight: { iata: "LATE" }, arrival: { iata: "YYZ", terminal: "1", scheduled: "2026-10-27T18:00:00-04:00" } }), flight({ flight: { iata: "EARLY" }, arrival: { iata: "YYZ", terminal: "1", scheduled: "2026-10-27T08:00:00-04:00" } }), flight({ flight: { iata: "UNTIMED" }, arrival: { iata: "YYZ", terminal: "1" } })] });
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
