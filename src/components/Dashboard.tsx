"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { countUnverified, filterFlights, tomorrowInToronto, type DashboardPayload, type Flight } from "@/lib/flights";

type ApiResponse = DashboardPayload | { error: string; targetDate?: string };
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
const timeLabel = (value: string | null) => {
  if (!value) return "—";
  // flightsFuture supplies Toronto local wall time without a timezone suffix.
  const local = value.match(/^\d{4}-\d{2}-\d{2}[ T](\d{2}:\d{2})/);
  if (local) return local[1];
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed);
};
const freshnessLabel = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
const EMPTY_FLIGHTS: Flight[] = [];

export default function Dashboard() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [excludeUs, setExcludeUs] = useState(false);
  const [query, setQuery] = useState("");
  const [showUnverified, setShowUnverified] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/flights${refresh ? "?refresh=true" : ""}`, { cache: "no-store" });
      const body = await response.json() as ApiResponse;
      if (body.targetDate) setTargetDate(body.targetDate);
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Could not load flight data.");
      setPayload(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load flight data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { setTargetDate(tomorrowInToronto()); void load(); }, [load]);

  const flights = payload?.flights ?? EMPTY_FLIGHTS;
  const verified = useMemo(() => filterFlights(flights, excludeUs), [flights, excludeUs]);
  const terminalOne = flights.filter((flight) => flight.isTerminal1 === true);
  const unverifiedCount = countUnverified(flights);
  const countryCount = new Set(verified.map((flight) => flight.originCountryCode ?? flight.originCountry).filter(Boolean)).size;
  const visible = (showUnverified ? flights.filter((flight) => flight.isInternational === null || flight.isTerminal1 === null) : verified)
    .filter((flight) => !excludeUs || (showUnverified ? flight.isUsOrigin === false : flight.isUsOrigin !== true))
    .filter((flight) => `${flight.airline ?? ""} ${flight.flightNumber ?? ""} ${flight.originAirport ?? ""} ${flight.originCode ?? ""} ${flight.originCountry ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return <main className="shell">
    <div className="topline"><div className="brand"><div className="brand-mark"><PlaneIcon /></div><span>PEARSON <b>FLIGHT INTELLIGENCE</b></span></div><span className="live-label"><i /> SCHEDULED OPERATIONS</span></div>
    <header className="hero">
      <div>
        <div className="eyebrow">TORONTO PEARSON · YYZ</div>
        <h1>International arrivals</h1>
        <p className="subtitle">Terminal 1 · Tomorrow&apos;s scheduled inbound flights</p>
      </div>
      <div className="hero-actions">
        <div className="date-block"><span className="date-caption">ARRIVAL DATE · TORONTO</span><strong>{targetDate ? dateLabel(targetDate) : "Tomorrow · Toronto local date"}</strong></div>
        <button className="refresh-button" onClick={() => void load(true)} disabled={loading || refreshing}><RefreshIcon spin={refreshing} />{refreshing ? "Refreshing…" : "Refresh data"}</button>
      </div>
    </header>

    <section className="metrics" aria-label="Arrival summary">
      <Metric icon={<GlobeIcon />} label="Confirmed international" value={loading ? "—" : String(verified.length)} detail="T1 arrivals with verified foreign origin" color="blue" />
      <Metric icon={<TerminalIcon />} label="Terminal 1 confirmed" value={loading ? "—" : String(terminalOne.length)} detail="Terminal assignment supplied by provider" color="teal" />
      <Metric icon={<PinIcon />} label="Origin countries" value={loading ? "—" : String(countryCount)} detail="Among confirmed eligible arrivals" color="purple" />
      <Metric icon={<AlertIcon />} label="Needs verification" value={loading ? "—" : String(unverifiedCount)} detail="Origin country or terminal is unavailable" color="amber" />
    </section>

    <section className="notice"><div className="notice-symbol"><InfoIcon /></div><p><strong>Data coverage note</strong><span>Aviationstack supplies the schedule and airport codes. Origin country, city, and name are resolved from a separate airport reference; unmatched origin codes remain unverified and outside the confirmed count.</span></p><button onClick={() => setShowUnverified(!showUnverified)}>{showUnverified ? "View confirmed arrivals" : "Review unverified arrivals"}<ArrowIcon /></button></section>

    {error && <div className="error-banner" role="alert"><AlertIcon /><div><strong>Flight data unavailable</strong><span>{error}</span></div><button onClick={() => void load()}>Try again</button></div>}

    <section className="table-card">
      <div className="table-heading"><div><div className="eyebrow">TOMORROW’S FLIGHT BOARD</div><h2>{showUnverified ? "Arrivals needing verification" : "Terminal 1 international arrivals"}</h2><p>{showUnverified ? "Potential arrivals with an unknown origin country or terminal assignment." : "Scheduled times shown in Toronto local time · Sorted by arrival"}</p></div><div className="table-meta"><span className={`source-pill ${payload?.source === "live" ? "source-live" : ""}`}><i />{payload?.source === "live" ? "Fresh data" : payload ? "Cached data" : "Awaiting data"}</span><span>{payload ? `Updated ${freshnessLabel(payload.fetchedAt)} ET` : "—"}</span></div></div>
      <div className="filters"><label className="search"><SearchIcon /><input aria-label="Search flights" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search airline, flight or origin" /></label><label className="check"><input type="checkbox" checked={excludeUs} onChange={(e) => setExcludeUs(e.target.checked)} /><span className="checkmark" />Exclude US origins</label><span className="results-count">{loading ? "Loading flights…" : `${visible.length} ${visible.length === 1 ? "flight" : "flights"}`}</span></div>

      <div className="table-scroll"><table><thead><tr><th>ARRIVAL · TORONTO</th><th>FLIGHT</th><th>AIRLINE</th><th>ORIGIN</th><th>TERMINAL</th><th>STATUS</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className="state-cell"><div className="spinner" /><strong>Loading tomorrow&apos;s schedule</strong><span>Connecting securely to Aviationstack…</span></td></tr> : !error && visible.length === 0 ? <tr><td colSpan={6} className="state-cell"><div className="empty-icon"><PlaneIcon /></div><strong>{showUnverified ? "No arrivals need verification" : query ? "No flights match your search" : "No confirmed arrivals to display"}</strong><span>{showUnverified ? "No potential arrivals with unknown origin or terminal data were returned." : "The provider may have no matching flights, or required origin data may not be available."}</span></td></tr> : visible.map((flight) => <FlightRow key={flight.id} flight={flight} unverified={showUnverified} />)}
      </tbody></table></div>
      {payload?.truncated && <div className="truncated-note"><AlertIcon />Results reached the safe 300-record pagination limit. Some arrivals may not be shown.</div>}
      <div className="table-footer"><span><span className="legend-dot" /> Scheduled arrival <span className="legend-separator">·</span> Estimated arrival shown only when supplied</span><span>Schedules: Aviationstack · Origin reference: OurAirports</span></div>
    </section>
    <footer><span>For planning use. Flight schedules and terminal assignments can change.</span><span>All times shown in Toronto local time (ET)</span></footer>
  </main>;
}

function Metric({ icon, label, value, detail, color }: { icon: React.ReactNode; label: string; value: string; detail: string; color: string }) {
  return <article className={`metric metric-${color}`}><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}</strong><p>{detail}</p></article>;
}

function FlightRow({ flight, unverified }: { flight: Flight; unverified: boolean }) {
  const terminalLabel = flight.isTerminal1 === true ? "T1" : flight.terminal ?? "Unknown";
  return <tr><td><strong className="arrival-time">{timeLabel(flight.scheduledArrival)}</strong>{flight.estimatedArrival && <span className="time-sub">Est. {timeLabel(flight.estimatedArrival)}</span>}</td><td><strong className="flight-number">{flight.flightNumber ?? "Unknown"}</strong></td><td>{flight.airline ?? "Not provided"}</td><td><strong>{flight.originCode ?? "Unknown"}</strong><span className="origin-sub">{flight.originCity ?? flight.originAirport ?? "Airport name unavailable"}{flight.originCountry ? `, ${flight.originCountry}` : unverified ? ", country unverified" : ""}</span></td><td><span className={`terminal-tag ${flight.isTerminal1 === null ? "terminal-unknown" : ""}`}>{terminalLabel}</span></td><td>{flight.status ? <span className="status-tag">{flight.status}</span> : <span className="status-unknown">Not provided</span>}</td></tr>;
}

function PlaneIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m2.5 12 19-8-6.2 18-3.1-7.8L2.5 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m12.2 14.2 5.1-5.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function RefreshIcon({ spin = false }: { spin?: boolean }) { return <svg className={spin ? "spin-icon" : ""} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M5.6 9A7 7 0 0 1 18 6.3L20 12M4 12l2 5.7A7 7 0 0 0 18.4 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function GlobeIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 12h17M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z" stroke="currentColor" strokeWidth="1.5"/></svg>; }
function TerminalIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M8 8h8M8 12h8M8 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
function PinIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6"/></svg>; }
function AlertIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 9 16H3l9-16Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M12 9v4m0 3h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function InfoIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/><path d="M12 11v5m0-8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
