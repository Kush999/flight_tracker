# Pearson Flight Intelligence

A single-page dashboard for tomorrow's scheduled arrivals at Toronto Pearson (YYZ), focused on Terminal 1 international flights. The dashboard uses only verified data for its confirmed international count and explicitly surfaces missing origin and terminal information.

## Stack

- Next.js App Router and Route Handler
- TypeScript with strict checking
- Tailwind CSS (with custom dashboard styles)
- Vitest for date, normalization, filtering, sorting, and missing-data tests

## Aviationstack key

Create an Aviationstack account and copy its access key from the account dashboard. `/flightsFuture` is a paid-plan endpoint; the provider's current schedule announcement says it is included with Starter, Professional, and Enterprise. The key must allow future schedules.

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

The server computes tomorrow from the `America/Toronto` calendar date, including date boundaries and daylight-saving changes, then requests `GET https://api.aviationstack.com/v1/flightsFuture` with `iataCode=YYZ`, `type=arrival`, `date=YYYY-MM-DD`, `limit=100`, and `offset` for pagination. Aviationstack's published Swagger spec defines `limit` (default/max 100 below Professional; 1,000 on Professional and above), `offset`, and a pagination object with `limit`, `offset`, `count`, and `total`. The endpoint supports dates from the following day through twelve months ahead. The route compares tomorrow's Toronto date with the provider's UTC calendar window and returns a clear out-of-window message during the brief period when local tomorrow is still the provider's current date.

The dashboard treats a flight as Terminal 1 only when arrival terminal is `1` or `T1` (case/spacing normalized). It treats a flight as international only when origin country data confirms a non-Canadian country. The published future-flight schema includes origin/arrival IATA and ICAO codes, terminal, scheduled time, airline, and flight identifiers; it does not include origin country/city/airport name, estimated or actual arrival, or flight status. To resolve origin country, city, and airport name, the server uses a compact reference snapshot keyed by provider origin IATA code. It was generated from OurAirports' daily airport CSV (public domain, October 26, 2026) using `scripts/build_airport_reference.py`. Provider-supplied fields take precedence. If an origin code is missing from the reference snapshot, the record remains unverified and is excluded from the confirmed international count/table; the unverified view exposes records with unknown origin country or terminal. When country information is available, the US checkbox removes US-origin arrivals; US flights are otherwise international arrivals into Canada. To refresh the snapshot, download the latest `airports.csv` from OurAirports and run `python3 scripts/build_airport_reference.py airports.csv src/data/airport-reference.json`.

Country and terminal verification counts can overlap in the summary (the card counts affected records once). OurAirports states that its public-domain dataset comes with no guarantee of accuracy; airport code mappings should be checked against authoritative airport information for operational use. The dashboard cannot show reliable live status for future schedules. Coverage is limited to provider records and airport codes matched by the reference snapshot; it does not claim exhaustive YYZ coverage.

## Refresh and caching

The server keeps a 12-minute cache per target date and key in process memory. Normal page loads reuse it. Manual refresh bypasses the application cache and fetches a new schedule; the response says whether the data was fetched live or served from cache. `/flightsFuture` rate limits paid-plan calls to one request every 10 seconds, so pagination is sequential and spaced accordingly. Pagination is bounded at 3 pages / 300 records; if provider pagination indicates more records, the UI warns that results are incomplete. The route allows up to 60 seconds for a paginated request. Serverless instances may have separate in-memory caches, so high-volume deployments can still make parallel cache misses; this MVP avoids automatic polling and coalesces same-process concurrent requests.

## Deploy to Vercel

1. Push this project to a Git repository.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the detected Next.js settings.
3. In **Project Settings → Environment Variables**, add `AVIATIONSTACK_ACCESS_KEY` for Production (and Preview if needed). Do not use a `NEXT_PUBLIC_` prefix.
4. Deploy. Vercel builds the app with `npm run build`; the `/api/flights` Node.js Route Handler runs server-side.
5. Open the deployed site and check the dashboard. The live route requires a key with `/flightsFuture` access; otherwise it returns a clear setup or plan-access error.

The application requires no database or local file in production. Schedules and terminal assignments may change, and this dashboard reflects the provider's latest available information rather than guaranteed operational truth.

## Data references

- [Aviationstack API documentation](https://aviationstack.com/documentation)
- [APILayer future-schedule announcement](https://blog.apilayer.com/introducing-continuous-flight-schedules/)
- [Aviationstack published Swagger specification](https://api.swaggerhub.com/apis/apilayer-863/AviationstackAPI/1.0.0/swagger.json)
- [OurAirports open-data downloads and terms](https://ourairports.com/data/)
