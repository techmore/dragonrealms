// Served experiment reports are public. Publish only benchmark metadata,
// never transport credentials or arbitrary fields from a private caller.
const PUBLIC_FIELDS = ['runId','status','mode','startedAt','updatedAt','guild','race','resumeChar',
  'targetCircle','boost','worldPort','minutesPerLeg','totalLegs','completedLegs','expIntervalSeconds',
  'concurrency','comparisonType','statPolicy','currentLeg','estimatedRemainingMinutes','decisionRule'];
const PLAN_FIELDS = ['index','guild','race','repeat','variant','char','status'];
const project = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
export function serializePublicExperiment(value) {
  const body = project(value, PUBLIC_FIELDS);
  body.plan = (Array.isArray(value.plan) ? value.plan : []).map(entry => project(entry, PLAN_FIELDS));
  return JSON.stringify(body, null, 2);
}
