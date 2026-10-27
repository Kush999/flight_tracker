import { arrivalClockForDisplay, arrivalDateInToronto, todayInToronto, type FlightGroup } from "@/lib/flights";

export type ArrivalWave = {
  startMinute: number;
  label: string;
  arrivals: FlightGroup[];
  isPeak: boolean;
};

const clockLabel = (minute: number) => {
  const hour = Math.floor(minute / 60) % 24;
  const minuteOfHour = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minuteOfHour).padStart(2, "0")}`;
};

function minuteOfDayInToronto(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

/** Counts confirmed grouped arrivals in upcoming Toronto-local 30-minute windows. */
export function buildArrivalWaves(groups: FlightGroup[], now: Date): ArrivalWave[] {
  const targetDate = todayInToronto(now);
  const currentMinute = minuteOfDayInToronto(now);
  const buckets = new Map<number, FlightGroup[]>();

  for (const group of groups) {
    const scheduled = group.representative.scheduledArrival;
    const date = arrivalDateInToronto(scheduled);
    const clock = arrivalClockForDisplay(scheduled);
    if (date !== targetDate || !clock) continue;
    const [hour, minute] = clock.split(":").map(Number);
    const arrivalMinute = hour * 60 + minute;
    if (!Number.isFinite(arrivalMinute) || arrivalMinute < currentMinute) continue;
    const bucketStart = Math.floor(arrivalMinute / 30) * 30;
    buckets.set(bucketStart, [...(buckets.get(bucketStart) ?? []), group]);
  }

  const peakCount = Math.max(0, ...Array.from(buckets.values(), (arrivals) => arrivals.length));
  return Array.from(buckets, ([startMinute, arrivals]) => ({
    startMinute,
    label: `${clockLabel(startMinute)}–${clockLabel(startMinute + 30)}`,
    arrivals,
    isPeak: arrivals.length === peakCount && peakCount > 0,
  })).sort((a, b) => a.startMinute - b.startMinute);
}
