export function summarizeDecisions(decisions: any[]) {
  return {
    total: decisions.length,
    a_grade: decisions.filter((item) => item.grade === 'A').length,
    b_grade: decisions.filter((item) => item.grade === 'B').length,
    watch: decisions.filter((item) => item.status === 'WATCH').length,
    updated_at: new Date().toISOString(),
  };
}
