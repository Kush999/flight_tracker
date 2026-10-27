import { describe, expect, it } from "vitest";
import { buildArrivalWaves } from "@/lib/arrival-waves";
import { groupArrivalRows, normalizeFlights } from "@/lib/flights";

function arrival(flightNumber: string, origin: string, scheduled: string) {
  return {
    departure: { iata: origin, countryCode: "GB", countryName: "United Kingdom", city: origin },
    arrival: { iata: "YYZ", terminal: "1", scheduled },
    airline: { name: "Example Air" },
    flight: { iata: flightNumber },
    flight_status: "scheduled",
  };
}

describe("buildArrivalWaves", () => {
  it("buckets future arrivals into Toronto-local half hours and marks the busiest interval", () => {
    const flights = normalizeFlights({ data: [
      arrival("AC101", "LHR", "2026-10-27T11:05:00+00:00"),
      arrival("AC102", "CDG", "2026-10-27T11:29:00+00:00"),
      arrival("AC103", "FRA", "2026-10-27T11:30:00+00:00"),
      arrival("AC104", "MAD", "2026-10-27T10:59:00+00:00"),
      arrival("AC105", "NRT", "2026-10-28T12:05:00+00:00"),
    ] });
    const groups = groupArrivalRows(flights);
    const waves = buildArrivalWaves(groups, new Date("2026-10-27T15:00:00Z")); // 11:00 in Toronto

    expect(waves.map((wave) => [wave.label, wave.arrivals.length, wave.isPeak])).toEqual([
      ["11:00–11:30", 2, true],
      ["11:30–12:00", 1, false],
    ]);
    expect(waves[0].arrivals.flatMap((group) => group.flightNumbers)).toEqual(["AC101", "AC102"]);
  });

  it("counts one grouped arrival rather than every codeshare number", () => {
    const flights = normalizeFlights({ data: [
      arrival("AC887", "VIE", "2026-10-27T14:45:00+00:00"),
      { ...arrival("UA8405", "VIE", "2026-10-27T14:45:00+00:00"), airline: { name: "United Airlines" } },
    ] });
    const waves = buildArrivalWaves(groupArrivalRows(flights), new Date("2026-10-27T14:00:00Z"));

    expect(waves).toHaveLength(1);
    expect(waves[0].arrivals).toHaveLength(1);
    expect(waves[0].arrivals[0].flightNumbers).toEqual(["AC887", "UA8405"]);
  });

  it("returns no waves when there are no future arrivals with scheduled times", () => {
    const flights = normalizeFlights({ data: [
      arrival("AC101", "LHR", "2026-10-27T10:59:00+00:00"),
      arrival("AC102", "CDG", "2026-10-27T11:05:00+00:00"),
    ] });
    expect(buildArrivalWaves(groupArrivalRows(flights), new Date("2026-10-27T16:00:00Z"))).toEqual([]);
  });
});
