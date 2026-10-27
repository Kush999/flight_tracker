# Pearson Flight Intelligence

A single-page dashboard for today's live arrivals at Toronto Pearson (YYZ), focused on Terminal 1 international flights. The dashboard uses only verified data for its confirmed international count and explicitly surfaces missing origin and terminal information.

## Stack

- Next.js App Router and Route Handler
- TypeScript with strict checking
- Tailwind CSS (with custom dashboard styles)
- Vitest for date, normalization, filtering, sorting, and missing-data tests

## Aviationstack key

Create an Aviationstack account and copy its access key from the account dashboard. This version uses `/v1/flights` for real-time/current-day flight status. Aviationstack currently lists real-time flights on its Free plan, with a quota of 100 requests per month and a personal-use, non-commercial license. Rogers/Fido store use is commercial, so confirm licensing or use a commercial plan before using this dashboard for store operations. A paginated refresh can consume more than one provider request.

Copy `.env.example` to `.env.local` and set:

```sh
AVIATIONSTACK_ACCESS_KEY=your_real_key
```

Never add a real key to source control. The key is read only by the server route and is never sent to the browser. If it is missing, the route returns a setup message.

## Run locally

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. Live calls require a valid Aviationstack key and plan access. Without a key the dashboard shows a clear setup error; there is no sample flight data.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

## Data and filtering

The server computes today's calendar date in `America/Toronto` (including midnight and daylight-saving boundaries), then requests `GET https://api.aviationstack.com/v1/flights` with `arr_iata=YYZ`, `limit=100`, and `offset` for pagination. It filters returned records to the Toronto date locally because Aviationstack's APILayer tutorial says `flight_date` requires Basic. Its current FAQ also says route-based filters may require a paid plan; if the provider rejects `arr_iata=YYZ`, the app reports the safe provider error code rather than presenting an unfiltered global feed as YYZ data. Free real-time access alone may therefore be insufficient for this exact dashboard. It does not use `/flightsFuture` or show tomorrow's schedule. The response's `flight_status` distinguishes scheduled, active, landed, cancelled, incident, and diverted records. The API also supplies scheduled, estimated, and actual arrival timestamps where available. The Aviationstack Swagger spec documents `limit`/`offset` pagination and `pagination {limit, offset, count, total}`.

The dashboard confirms a Terminal 1 arrival only when the arrival terminal is `1` or `T1` (case/spacing normalized), a YYZ arrival only when the returned arrival code is `YYZ`, and an international arrival only when origin country data confirms a non-Canadian country. The live endpoint supplies terminal, status, and time fields but does not reliably provide origin country/city/airport name. To resolve origin details, the server uses a compact OurAirports reference snapshot keyed by origin IATA code. It was generated from OurAirports' daily airport CSV (public domain, October 26, 2026) using `scripts/build_airport_reference.py`. Provider-supplied fields take precedence. If an origin code is missing from the reference snapshot, the record remains unverified and is excluded from the confirmed international count/table. When country information is available, the US checkbox removes US-origin arrivals; US flights are otherwise international arrivals into Canada. To refresh the snapshot, download the latest `airports.csv` from OurAirports and run `python3 scripts/build_airport_reference.py airports.csv src/data/airport-reference.json`.

Country, terminal, and destination verification counts can overlap in the summary (the card counts affected records once). OurAirports states that its public-domain dataset comes with no guarantee of accuracy; airport code mappings should be checked against authoritative airport information for operational use. Today's live endpoint cannot provide tomorrow's future schedule. The route scans at most 600 provider rows across six pages; if pagination says more records exist, the UI reports the exact scanned and reported totals and warns that arrivals may be missing.

The table combines rows with the same YYZ-local scheduled minute, origin airport, and terminal into one arrival row, showing all returned flight numbers and airlines together. This is a practical codeshare grouping heuristic because the feed does not reliably identify a single canonical operating flight. Two separate flights from the same origin scheduled in the same minute could also be combined; all source flight numbers remain visible in the grouped row.

## Refresh and caching

The server keeps a five-minute cache per flight date and key in process memory. Normal page loads reuse it; manual refresh bypasses that cache and reports whether it fetched fresh or reused an in-flight response. The dashboard does not auto-poll. Requests are spaced by one second and pagination is bounded at six pages / 600 records to limit latency and API use. If provider pagination indicates more records, the UI warns that results are incomplete. The route allows up to 60 seconds for a paginated request; each page is a separate Aviationstack request and counts toward plan usage. Serverless instances may have separate in-memory caches, so multiple Vercel instances can make separate calls. This MVP coalesces same-process concurrent requests but does not have a shared quota counter.

## Deploy to Vercel

1. Push this project to a Git repository.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the detected Next.js settings.
3. In **Project Settings → Environment Variables**, add `AVIATIONSTACK_ACCESS_KEY` for Production (and Preview if needed). Do not use a `NEXT_PUBLIC_` prefix.
4. Deploy. Vercel builds the app with `npm run build`; the `/api/flights` Node.js Route Handler runs server-side.
5. Open the deployed site and check today's live arrivals. The route requires an API key with real-time flight access; otherwise it returns a clear setup or plan-access error.

The application requires no database or local file in production. Flight statuses may update during the day and terminal assignments may change; the dashboard reflects the provider's latest available information rather than guaranteed operational truth. Aviationstack says real-time status updates may be delayed by 30–60 seconds.

For YYZ arrivals, the current Aviationstack response returns schedule timestamps with a `+00:00` suffix whose clock values match Pearson's published local times. The dashboard preserves the schedule's clock value rather than converting it, which would shift it by four or five hours. This is based on comparison with Pearson and should be rechecked if Aviationstack changes how it encodes these timestamps.

## Data references

- [Aviationstack API documentation](https://aviationstack.com/documentation)
- [Aviationstack pricing and plan limits](https://aviationstack.com/pricing/)
- [Aviationstack real-time data and API FAQ](https://aviationstack.com/faq)
- [Aviationstack published Swagger specification](https://api.swaggerhub.com/apis/apilayer-863/AviationstackAPI/1.0.0/swagger.json)
- [OurAirports open-data downloads and terms](https://ourairports.com/data/)
