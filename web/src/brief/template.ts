import type { BriefInput, BriefOutput } from './types';

const metric = (input: BriefInput, key: string): number | null => input.metrics[key]?.value ?? null;

/**
 * A brief written by rules, not by AI, from the same input. It is the fallback when the AI service is
 * unavailable, and it is labelled as such in the interface. Every number comes from the input, so it
 * passes the same validation as an AI answer.
 */
export function templateBrief(input: BriefInput): BriefOutput {
  const s = input.scenario;
  const dest = s.destinations === 'emergency' ? 'emergency care' : 'primary care';
  const cut = metric(input, 'cut_off_places') ?? 0;
  const delayedAfter = metric(input, 'delayed_places_after') ?? 0;
  const delayedBefore = metric(input, 'delayed_places_before') ?? 0;
  const restoredMin = metric(input, 'restored_after_h_min');
  const restoredMax = metric(input, 'restored_after_h_max');
  const people = metric(input, 'people_cut_off');

  const restoredText =
    restoredMin === null || restoredMax === null
      ? null
      : restoredMin === restoredMax
        ? `${restoredMin} hours`
        : `${restoredMin} to ${restoredMax} hours`;

  let summary: string;
  if (cut > 0) {
    summary = `A ${s.severity} landslide on ${s.road} would cut ${cut} places off from ${dest}`;
    summary += restoredText ? `, with access assumed to return after ${restoredText}.` : '.';
  } else if (delayedAfter > delayedBefore) {
    summary = `A ${s.severity} landslide on ${s.road} would cut no place off, but would put ${delayedAfter} places beyond ${s.threshold_min} minutes of ${dest}, up from ${delayedBefore}.`;
  } else {
    summary = `A ${s.severity} landslide on ${s.road} changes nothing in the simulation: every place keeps a route to ${dest} within the same limits.`;
  }

  const key_risks: string[] = [];
  if (cut > 0) key_risks.push(`${cut} places lose their only route to ${dest} until the road is cleared.`);
  if (delayedAfter > delayedBefore) key_risks.push(`${delayedAfter} places would be beyond ${s.threshold_min} minutes from ${dest}.`);
  const named = input.top_affected.slice(0, 3).map((t) => {
    if (t.status === 'cut_off') return `${t.place} (cut off)`;
    return `${t.place} (${t.before_min} to ${t.after_min} minutes)`;
  });
  if (named.length > 0) key_risks.push(`Most affected: ${named.join('; ')}.`);
  if (key_risks.length === 0) key_risks.push('No place is put at greater risk by this event in the simulation.');

  const recommended_actions: BriefOutput['recommended_actions'] = [];
  if (cut > 0) {
    recommended_actions.push({
      action: 'Stage an ambulance, essential medicines and rations on the cut-off side of the closure.',
      rationale: `${cut} places have no other route to ${dest}.`,
      metric_refs: ['cut_off_places'],
    });
    if (restoredText) {
      recommended_actions.push({
        action: `Give clearing ${s.road} the highest priority.`,
        rationale: `In the simulation access returns only after ${restoredText}.`,
        metric_refs: ['cut_off_places', 'restored_after_h_max'].filter((k) => k in input.metrics),
      });
    }
  }
  if (delayedAfter > delayedBefore) {
    recommended_actions.push({
      action: 'Plan for longer ambulance journeys from the listed places and warn their residents.',
      rationale: `${delayedAfter} places would be beyond ${s.threshold_min} minutes of ${dest}.`,
      metric_refs: ['delayed_places_after'],
    });
  }
  recommended_actions.push({
    action: 'Check the real state of the road on the ground before acting on this simulation.',
    rationale: 'The simulation uses assumed speeds and clearance times.',
    metric_refs: ['cut_off_places'],
  });

  const caveats = ['This is a simulation based on assumed speeds and clearance times, not a forecast or a live report.'];
  if (cut > 0 && people === null) caveats.push('The number of people affected is unknown because no population data is loaded.');
  if (input.data_gaps.places_off_road > 0 || input.data_gaps.places_no_route_before > 0) {
    caveats.push(
      `Not counted: ${input.data_gaps.places_off_road} places are off any drivable road, and ${input.data_gaps.places_no_route_before} had no route before the slide.`,
    );
  }

  return { summary, key_risks, recommended_actions, caveats };
}
