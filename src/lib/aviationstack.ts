import { normalizeFlights, type Flight } from "@/lib/flights";
import { countryNameForCode, resolveAirport } from "@/lib/airport-reference.server";

const BASE_URL = "https://api.aviationstack.com/v1/flightsFuture";
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const CACHE_TTL_MS = 12 * 60 * 1000;
const REQUEST_GAP_MS = 10_000;
type CacheEntry = { data: Flight[]; expires: number; fetchedAt: string; truncated: boolean };
type FlightResult = { flights: Flight[]; fetchedAt: string; source: "live" | "cache"; truncated: boolean };
const cache = new Map<string, CacheEntry>();
const lastRequest = new Map<string, number>();
const requestQueue = new Map<string, Promise<void>>();
const inFlight = new Map<string, Promise<FlightResult>>();

export class ProviderError extends Error {
  constructor(public readonly kind: "auth" | "restricted" | "rate" | "timeout" | "unavailable" | "invalid", message: string) {
    super(message);
  }
}

export function providerErrorFor(status: number, code = ""): ProviderError {
  const normalizedCode = code.toLowerCase();
  if (status === 401 || normalizedCode.includes("invalid_access_key")) return new ProviderError("auth", "Aviationstack rejected the API key. Check AVIATIONSTACK_ACCESS_KEY.");
  if (status === 403 || normalizedCode.includes("function_access_restricted")) return new ProviderError("restricted", "Your Aviationstack plan does not allow future flight schedules. A paid plan with /flightsFuture access is required.");
  if (status === 429) return new ProviderError("rate", "Aviationstack request limit reached. Wait before refreshing.");
  return new ProviderError("unavailable", "Aviationstack is temporarily unavailable. Try again later.");
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForRateSlot(key: string): Promise<void> {
  const previous = requestQueue.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  requestQueue.set(key, previous.then(() => current));
  await previous;
  const sinceLast = Date.now() - (lastRequest.get(key) ?? 0);
  if (sinceLast < REQUEST_GAP_MS) await pause(REQUEST_GAP_MS - sinceLast);
  lastRequest.set(key, Date.now());
  release();
}

async function requestPage(key: string, date: string, offset: number): Promise<unknown> {
  await waitForRateSlot(key);
  const url = new URL(BASE_URL);
  url.searchParams.set("access_key", key);
  url.searchParams.set("iataCode", "YYZ");
  url.searchParams.set("type", "arrival");
  url.searchParams.set("date", date);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new ProviderError("timeout", "Aviationstack took too long to respond. Try refreshing in a moment.");
    throw new ProviderError("unavailable", "Aviationstack could not be reached. Check your connection and try again.");
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new ProviderError("invalid", "Aviationstack returned an unreadable response."); }
  const payload = body as { error?: { code?: string; message?: string } };
  if (!response.ok || payload.error) {
    const code = payload.error?.code ?? "";
    throw providerErrorFor(response.status, code);
  }
  return body;
}

export async function getFlights(date: string, refresh = false): Promise<FlightResult> {
  const key = process.env.AVIATIONSTACK_ACCESS_KEY;
  if (!key) throw new ProviderError("auth", "Setup required: add AVIATIONSTACK_ACCESS_KEY to the server environment.");
  const cacheKey = `${key}:${date}`;
  const cached = cache.get(cacheKey);
  if (!refresh && cached && cached.expires > Date.now()) return { flights: cached.data, fetchedAt: cached.fetchedAt, truncated: cached.truncated, source: "cache" };
  const pending = inFlight.get(cacheKey);
  if (pending) return { ...(await pending), source: "cache" };

  const request = fetchAndCache(key, cacheKey, date);
  inFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(cacheKey) === request) inFlight.delete(cacheKey);
  }
}

async function fetchAndCache(key: string, cacheKey: string, date: string): Promise<FlightResult> {
  const all: Flight[] = [];
  let truncated = false;
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await requestPage(key, date, offset);
    let flights: Flight[];
    try { flights = normalizeFlights(body, resolveAirport, countryNameForCode); } catch { throw new ProviderError("invalid", "Aviationstack returned flight data in an unexpected format."); }
    all.push(...flights);
    const pagination = (body as { pagination?: { count?: number; total?: number; limit?: number; offset?: number } }).pagination;
    if (!pagination || pagination.total === undefined) {
      if (flights.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) truncated = true;
      offset += flights.length;
      continue;
    }
    if (all.length >= pagination.total) break;
    if (page === MAX_PAGES - 1) truncated = all.length < pagination.total;
    offset = (pagination.offset ?? offset) + (pagination.count ?? flights.length);
  }
  const fetchedAt = new Date().toISOString();
  const entry: CacheEntry = { data: all, expires: Date.now() + CACHE_TTL_MS, fetchedAt, truncated };
  cache.set(cacheKey, entry);
  return { flights: all, fetchedAt, source: "live", truncated };
}
