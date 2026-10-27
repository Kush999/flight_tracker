import { NextResponse } from "next/server";
import { getFlights, ProviderError } from "@/lib/aviationstack";
import { isProviderFutureDateAllowed, tomorrowInToronto } from "@/lib/flights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const targetDate = tomorrowInToronto();
  const requestedDate = new URL(request.url).searchParams.get("date");
  if (requestedDate && requestedDate !== targetDate) {
    return NextResponse.json({ error: "Only tomorrow's Toronto-local arrivals are available." }, { status: 400 });
  }
  if (!process.env.AVIATIONSTACK_ACCESS_KEY) {
    return NextResponse.json({ error: "Setup required: add AVIATIONSTACK_ACCESS_KEY to the server environment.", targetDate }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!isProviderFutureDateAllowed(targetDate)) {
    return NextResponse.json({ error: "Tomorrow's Toronto-local date is outside Aviationstack's current future-schedule window. Try again after the provider's date window advances." }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "true";
    const result = await getFlights(targetDate, refresh);
    return NextResponse.json({ targetDate, ...result });
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : new ProviderError("unavailable", "Flight data is temporarily unavailable.");
    const status = providerError.kind === "auth" ? (process.env.AVIATIONSTACK_ACCESS_KEY ? 502 : 503) : providerError.kind === "restricted" ? 403 : providerError.kind === "rate" ? 429 : providerError.kind === "invalid" ? 502 : 503;
    return NextResponse.json({ error: providerError.message, targetDate }, { status });
  }
}
