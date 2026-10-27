import { NextResponse } from "next/server";
import { getFlights, ProviderError } from "@/lib/aviationstack";
import { todayInToronto } from "@/lib/flights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const flightDate = todayInToronto();
  const requestedDate = new URL(request.url).searchParams.get("date");
  if (requestedDate && requestedDate !== flightDate) {
    return NextResponse.json({ error: "Only today's Toronto-local arrivals are available." }, { status: 400 });
  }
  if (!process.env.AVIATIONSTACK_ACCESS_KEY) {
    return NextResponse.json({ error: "Setup required: add AVIATIONSTACK_ACCESS_KEY to the server environment.", flightDate }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "true";
    const result = await getFlights(flightDate, refresh);
    return NextResponse.json({ flightDate, ...result });
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : new ProviderError("unavailable", "Flight data is temporarily unavailable.");
    const status = providerError.kind === "auth" ? (process.env.AVIATIONSTACK_ACCESS_KEY ? 502 : 503) : providerError.kind === "restricted" ? 403 : providerError.kind === "rate" ? 429 : providerError.kind === "invalid" ? 502 : 503;
    return NextResponse.json({ error: providerError.message, flightDate }, { status });
  }
}
