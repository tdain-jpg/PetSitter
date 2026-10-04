import { formatTaskTime } from './routineTasks';
import { formatDate } from './dates';
import type { FlightInfo } from '../types';

/**
 * How a flight reads to a sitter, everywhere it is shown.
 *
 * Flight times are stored as the date-time picker writes them,
 * "2026-10-07 07:10" (or with a "T"), and were displayed raw: 24-hour clock
 * and ISO dates, the one place left in the app still doing that. One helper so
 * the editor, the guide, the share link and the PDF all say it the same way.
 */

function split(raw: string | undefined): { date: string; time: string } | null {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?/);
  if (!m) return null;
  return { date: m[1], time: m[2] ?? '' };
}

const day = (date: string) =>
  formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * "Wed, Oct 7, 7:10 AM to 8:40 AM", naming the date once when both ends fall
 * on the same day. Unparseable input is shown as typed rather than dropped.
 */
export function formatFlightWhen(flight: Pick<FlightInfo, 'departure_time' | 'arrival_time'>): string {
  const dep = split(flight.departure_time);
  const arr = split(flight.arrival_time);
  const one = (p: { date: string; time: string }) =>
    p.time ? `${day(p.date)}, ${formatTaskTime(p.time)}` : day(p.date);
  if (dep && arr) {
    if (dep.date === arr.date && dep.time && arr.time) {
      return `${day(dep.date)}, ${formatTaskTime(dep.time)} to ${formatTaskTime(arr.time)}`;
    }
    return `${one(dep)} to ${one(arr)}`;
  }
  if (dep) return `Leaves ${one(dep)}`;
  if (arr) return `Lands ${one(arr)}`;
  return [flight.departure_time, flight.arrival_time].filter((s) => s && s.trim()).join(' to ');
}

/** "Dana · Delta 5286", or just "Delta 5286" when nobody is named. */
export function flightTitle(flight: Pick<FlightInfo, 'airline' | 'flight_number' | 'traveler'>): string {
  const number = [flight.airline, flight.flight_number].filter(Boolean).join(' ');
  return flight.traveler?.trim() ? `${flight.traveler.trim()} · ${number}` : number;
}

/** "Reach Dana at (612) 555-0100", when there is a number to give. */
export function flightContactLine(flight: Pick<FlightInfo, 'traveler' | 'traveler_phone'>): string | null {
  const phone = flight.traveler_phone?.trim();
  if (!phone) return null;
  const who = flight.traveler?.trim();
  return who ? `Reach ${who} at ${phone}` : `Contact: ${phone}`;
}
