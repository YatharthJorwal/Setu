// The single gateway from the UI and the 3D layer into the simulation core.
// Only state/ talks to sim/ (ARCHITECTURE section 3); everything else imports from here.
export {
  ASSUMPTIONS,
  SEVERITIES,
  T_GOLDEN_MIN_DEFAULT,
  activeMutations,
  buildRoadGraph,
  clearanceHours,
  edgeClassName,
  edgeSummary,
  parseGraph,
  rankCriticalEdges,
  runScenario,
} from '../sim';
export type {
  AssumptionRow,
  CriticalEdge,
  EdgeMutation,
  EdgeSummary,
  PlaceAccess,
  RoadGraph,
  RunResult,
  SetMetrics,
  Severity,
  Snapshot,
  TargetSet,
} from '../sim';
