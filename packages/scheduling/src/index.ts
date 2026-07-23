import type { SchedulingCandidate, SchedulingVerdict } from '@meridian/domain';
import { localDateBoundsV1 } from '@meridian/domain';

export interface SchedulingInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface ProposeBlocksInput {
  readonly availability: readonly SchedulingInterval[];
  readonly bufferMinutes: number;
  readonly busy: readonly SchedulingInterval[];
  readonly estimatedEffortMinutes: number;
  readonly maxBlockMinutes: number;
  readonly maxDeepWorkMinutesPerDay: number;
  readonly minBlockMinutes: number;
  readonly timeZone: string;
}

export interface ProposeBlocksResult {
  readonly alternatives: readonly string[];
  readonly candidates: readonly SchedulingCandidate[];
  readonly capacityMinutes: number;
  readonly exclusions: readonly string[];
  readonly scheduledMinutes: number;
  readonly verdict: SchedulingVerdict;
}

const MINUTE = 60_000;

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function merge(intervals: readonly SchedulingInterval[]): SchedulingInterval[] {
  const sorted = intervals
    .map((item) => ({
      endsAt: new Date(item.endsAt),
      startsAt: new Date(item.startsAt),
    }))
    .filter((item) => item.endsAt > item.startsAt)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const result: SchedulingInterval[] = [];
  for (const interval of sorted) {
    const prior = result.at(-1);
    if (prior && interval.startsAt <= prior.endsAt) {
      result[result.length - 1] = {
        endsAt: interval.endsAt > prior.endsAt ? interval.endsAt : prior.endsAt,
        startsAt: prior.startsAt,
      };
    } else result.push(interval);
  }
  return result;
}

function subtract(
  windows: readonly SchedulingInterval[],
  exclusions: readonly SchedulingInterval[],
): SchedulingInterval[] {
  let available = merge(windows);
  for (const exclusion of merge(exclusions)) {
    const next: SchedulingInterval[] = [];
    for (const window of available) {
      if (
        exclusion.endsAt <= window.startsAt ||
        exclusion.startsAt >= window.endsAt
      ) {
        next.push(window);
        continue;
      }
      if (exclusion.startsAt > window.startsAt)
        next.push({
          endsAt: exclusion.startsAt,
          startsAt: window.startsAt,
        });
      if (exclusion.endsAt < window.endsAt)
        next.push({ endsAt: window.endsAt, startsAt: exclusion.endsAt });
    }
    available = next;
  }
  return available;
}

function minutes(interval: SchedulingInterval): number {
  return Math.floor(
    (interval.endsAt.getTime() - interval.startsAt.getTime()) / MINUTE,
  );
}

export function proposeBlocks(input: ProposeBlocksInput): ProposeBlocksResult {
  if (
    input.minBlockMinutes <= 0 ||
    input.maxBlockMinutes < input.minBlockMinutes ||
    input.maxDeepWorkMinutesPerDay < input.minBlockMinutes ||
    input.estimatedEffortMinutes <= 0 ||
    input.bufferMinutes < 0
  )
    throw new RangeError('Scheduling constraints are internally inconsistent.');

  const bufferedBusy = input.busy.map((item) => ({
    endsAt: new Date(item.endsAt.getTime() + input.bufferMinutes * MINUTE),
    startsAt: new Date(item.startsAt.getTime() - input.bufferMinutes * MINUTE),
  }));
  const available = subtract(input.availability, bufferedBusy)
    .filter((item) => minutes(item) >= input.minBlockMinutes)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
  const dailyCapacity = new Map<string, number>();
  for (const interval of available) {
    let cursor = interval.startsAt;
    while (cursor < interval.endsAt) {
      const day = localDateKey(cursor, input.timeZone);
      const dayEnd = localDateBoundsV1(day, input.timeZone).end;
      const segmentEnd = dayEnd < interval.endsAt ? dayEnd : interval.endsAt;
      dailyCapacity.set(
        day,
        (dailyCapacity.get(day) ?? 0) +
          Math.floor((segmentEnd.getTime() - cursor.getTime()) / MINUTE),
      );
      cursor = segmentEnd;
    }
  }
  const capacityMinutes = [...dailyCapacity.values()].reduce(
    (total, value) => total + Math.min(value, input.maxDeepWorkMinutesPerDay),
    0,
  );
  const candidates: SchedulingCandidate[] = [];
  const dailyLoad = new Map<string, number>();
  let remaining = input.estimatedEffortMinutes;

  for (const interval of available) {
    let cursor = interval.startsAt;
    while (remaining >= input.minBlockMinutes) {
      const day = localDateKey(cursor, input.timeZone);
      const dailyRemaining =
        input.maxDeepWorkMinutesPerDay - (dailyLoad.get(day) ?? 0);
      const dayEnd = localDateBoundsV1(day, input.timeZone).end;
      const dayRemainingMinutes = Math.floor(
        (dayEnd.getTime() - cursor.getTime()) / MINUTE,
      );
      const intervalRemaining = Math.floor(
        (interval.endsAt.getTime() - cursor.getTime()) / MINUTE,
      );
      let blockMinutes = Math.min(
        remaining,
        input.maxBlockMinutes,
        dailyRemaining,
        dayRemainingMinutes,
        intervalRemaining,
      );
      const residual = remaining - blockMinutes;
      if (
        residual > 0 &&
        residual < input.minBlockMinutes &&
        blockMinutes - (input.minBlockMinutes - residual) >=
          input.minBlockMinutes
      )
        blockMinutes -= input.minBlockMinutes - residual;
      if (blockMinutes < input.minBlockMinutes) {
        if (
          dayEnd < interval.endsAt &&
          (dailyRemaining < input.minBlockMinutes ||
            dayRemainingMinutes < input.minBlockMinutes)
        ) {
          cursor = dayEnd;
          continue;
        }
        break;
      }
      const endsAt = new Date(cursor.getTime() + blockMinutes * MINUTE);
      candidates.push({
        endsAt: endsAt.toISOString(),
        minutes: blockMinutes,
        ordinal: candidates.length + 1,
        startsAt: cursor.toISOString(),
      });
      dailyLoad.set(day, (dailyLoad.get(day) ?? 0) + blockMinutes);
      remaining -= blockMinutes;
      cursor = endsAt;
    }
    if (remaining === 0) break;
  }

  const scheduledMinutes = input.estimatedEffortMinutes - remaining;
  const feasible = remaining === 0;
  const verdict: SchedulingVerdict = !feasible
    ? 'infeasible'
    : capacityMinutes - input.estimatedEffortMinutes < input.minBlockMinutes
      ? 'tight'
      : 'feasible';
  const exclusions: string[] = [];
  if (input.busy.length > 0)
    exclusions.push('Local busy blocks and their buffers were excluded.');
  if (available.length === 0)
    exclusions.push('No working window can fit the minimum block size.');
  if (!feasible)
    exclusions.push(
      'The available capacity or daily deep-work limit cannot fit all estimated effort.',
    );
  const alternatives = feasible
    ? []
    : [
        'Reduce the estimated effort.',
        'Move the deadline or add a working window.',
        'Reduce the minimum block size.',
        'Release another local commitment.',
      ];
  return {
    alternatives,
    candidates,
    capacityMinutes,
    exclusions,
    scheduledMinutes,
    verdict,
  };
}

export const packageId = '@meridian/scheduling' as const;
