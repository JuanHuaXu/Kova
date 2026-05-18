export function collectRecordMetricObjects(record) {
  const metrics = [];
  for (const phase of record.phases ?? []) {
    if (phase.metrics) {
      metrics.push(phase.metrics);
    }
  }
  if (record.finalMetrics) {
    metrics.push(record.finalMetrics);
  }
  return metrics;
}
