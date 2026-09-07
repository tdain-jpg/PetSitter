import type { Pet, RoutineTask, TimeBlock } from '../types';

/**
 * The tasks a guide's routine contains for a day, built from its pets.
 *
 * WHY THIS IS A MODULE AND NOT A SERVER QUERY. `guides.daily_routine` holds
 * only the CUSTOM tasks somebody typed in. Everything else — every feeding,
 * every dose of medication, walks, litter, water — is DERIVED here from the
 * pets on the guide and is stored nowhere. The plan for the cross-client Today
 * view called for an RPC flattening that jsonb server-side; doing that would
 * have produced a list with the custom tasks and nothing else, so a sitter's
 * day would have been missing the feeding and the medication. That is the
 * worst possible thing for this list to be missing, so the plan was wrong and
 * this is the correction.
 *
 * Reimplementing the derivation in SQL was the alternative and would have left
 * two copies of it, in two languages, guaranteed to drift the first time
 * somebody adds a feeding field. One function, called by both screens, is what
 * makes the per-guide checklist and the cross-client Today view incapable of
 * disagreeing about what is due.
 *
 * TIME BLOCKS come from the hour: before 11 morning, 11-15 midday, 15-20
 * evening, 20-06 bedtime. Preserved exactly as the per-guide screen had it,
 * including a medication with no time at all landing in the morning.
 */

/** Ordered, and the order Today groups by. */
export const TIME_BLOCKS: { id: TimeBlock; label: string; icon: string }[] = [
  { id: 'morning', label: 'Morning', icon: '\u{1F305}' },
  { id: 'midday', label: 'Midday', icon: '\u2600\uFE0F' },
  { id: 'evening', label: 'Evening', icon: '\u{1F306}' },
  { id: 'bedtime', label: 'Bedtime', icon: '\u{1F319}' },
];


/**
 * The hour of day a time string means, 0-23, or null if it means nothing.
 *
 * THE BUG THIS FIXES. This used to be `parseInt(time.split(':')[0], 10)`, which
 * reads 7 out of "7:30 PM" and files an evening feed under Morning. The time
 * field is free text with an "08:00" placeholder and no validation, and the
 * fixture already contained "7:30 AM", so 12-hour strings demonstrably reach
 * the database. The same expression governed medication, meaning a 9 PM dose
 * was listed as a morning dose — on a checklist somebody follows while looking
 * after an animal that needs it.
 *
 * Accepts "18:30", "6:30 PM", "6:30pm", "6 PM". Returns null for anything else
 * so callers can decide, rather than silently yielding NaN and defaulting.
 */
export function parseHour24(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];

  if (Number.isNaN(hour) || hour < 0 || minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    // 12 AM is midnight and 12 PM is noon — the one pair that does not follow
    // the "add twelve" rule, and the one most often got wrong.
    if (meridiem === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return hour;
}

/**
 * Which block an hour belongs to. Unparseable times go to morning, which is
 * where they went before and is the safest default: a task shown too early is
 * noticed, a task shown too late may not be.
 */
export function timeBlockForHour(hour: number | null): TimeBlock {
  if (hour === null) return 'morning';
  if (hour >= 11 && hour < 15) return 'midday';
  if (hour >= 15 && hour < 20) return 'evening';
  if (hour >= 20 || hour < 6) return 'bedtime';
  return 'morning';
}

/** One display format, so a list cannot show "7:30 AM" next to "18:30". */
export function formatTaskTime(raw: string | undefined | null): string {
  if (!raw) return '';
  const hour = parseHour24(raw);
  if (hour === null) return raw.trim();
  const minuteMatch = raw.trim().match(/:(\d{2})/);
  const minute = minuteMatch ? minuteMatch[1] : '00';
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

/**
 * Every generated id is prefixed with the guide id: completions are keyed by
 * (guide_id, task_id, date), and unprefixed ids ('walk-morning',
 * 'feeding-<petId>-...') would repeat across guides covering the same pet (or
 * duplicated guides), colliding in the checklist history.
 */
export function buildGeneratedTasks(guideId: string, guidePets: Pet[]): RoutineTask[] {

    const tasks: RoutineTask[] = [];
    let order = 0;

    guidePets.forEach((pet) => {
      // Feeding tasks
      pet.feeding_schedule.forEach((feeding) => {
        const timeBlock: TimeBlock = timeBlockForHour(parseHour24(feeding.time));

        tasks.push({
          id: `feeding-${guideId}-${pet.id}-${feeding.id}`,
          pet_id: pet.id,
          time_block: timeBlock,
          time: feeding.time,
          title: `Feed ${pet.name}`,
          description: `${feeding.amount} of ${feeding.food_type}${feeding.notes ? ` - ${feeding.notes}` : ''}`,
          is_recurring: true,
          is_custom: false,
          category: 'feeding',
          order: order++,
        });
      });

      // Medication tasks - create one task per time
      pet.medications.forEach((med) => {
        const times = med.times?.filter(t => t) || [];

        // If no specific times, create a single morning task
        if (times.length === 0) {
          tasks.push({
            id: `med-${guideId}-${pet.id}-${med.id}`,
            pet_id: pet.id,
            time_block: 'morning',
            title: `Give ${pet.name} medication`,
            description: `${med.name}: ${med.dosage}${med.with_food ? ' (with food)' : ''}${med.notes ? ` - ${med.notes}` : ''}`,
            is_recurring: true,
            is_custom: false,
            category: 'medication',
            order: order++,
          });
        } else {
          // Create a task for each time
          times.forEach((time, timeIndex) => {
            const timeBlock: TimeBlock = timeBlockForHour(parseHour24(time));

            tasks.push({
              id: `med-${guideId}-${pet.id}-${med.id}-${timeIndex}`,
              pet_id: pet.id,
              time_block: timeBlock,
              time: time,
              title: `Give ${pet.name} medication`,
              description: `${med.name}: ${med.dosage}${med.with_food ? ' (with food)' : ''}${med.notes ? ` - ${med.notes}` : ''}`,
              is_recurring: true,
              is_custom: false,
              category: 'medication',
              order: order++,
            });
          });
        }
      });
    });

    // Add general tasks
    if (guidePets.some((p) => p.species === 'dog')) {
      tasks.push({
        id: `gd-${guideId}-walk-morning`,
        time_block: 'morning',
        title: 'Morning walk',
        is_recurring: true,
        is_custom: false,
        category: 'walk',
        order: order++,
      });
      tasks.push({
        id: `gd-${guideId}-walk-evening`,
        time_block: 'evening',
        title: 'Evening walk',
        is_recurring: true,
        is_custom: false,
        category: 'walk',
        order: order++,
      });
    }

    if (guidePets.some((p) => p.species === 'cat')) {
      tasks.push({
        id: `gd-${guideId}-litter-morning`,
        time_block: 'morning',
        title: 'Clean litter box',
        is_recurring: true,
        is_custom: false,
        category: 'litter',
        order: order++,
      });
    }

    // Water refresh
    tasks.push({
      id: `gd-${guideId}-water-morning`,
      time_block: 'morning',
      title: 'Refresh water bowls',
      is_recurring: true,
      is_custom: false,
      category: 'water',
      order: order++,
    });

    return tasks;
}

/** Generated + custom, in the order both screens display them. */
export function sortRoutineTasks(tasks: RoutineTask[]): RoutineTask[] {
  return [...tasks].sort((a, b) => {
    const blockOrder =
      TIME_BLOCKS.findIndex((tb) => tb.id === a.time_block) -
      TIME_BLOCKS.findIndex((tb) => tb.id === b.time_block);
    if (blockOrder !== 0) return blockOrder;
    if (a.order !== b.order) return a.order - b.order;
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return 0;
  });
}
