export interface ReviewScope {
  start_series_id: string | null; start_volume_id: string | null; start_unit_id: string | null;
  track_b_enabled: boolean; track_b_series_id: string | null; track_b_volume_id: string | null; track_b_unit_id: string | null;
}
export interface ReviewTarget { sentenceId: string; unitId: string; unitNo: number; bookId: string; seriesId: string }
export function isReviewScopeAssigned(profile: ReviewScope, target: ReviewTarget, unitIndex: Map<string, { unit_no: number; textbook_id: string }>): boolean {
  const matches = (series: string | null, book: string | null, unit: string | null) => {
    const start = unit ? unitIndex.get(unit) : undefined;
    const volume = book ?? start?.textbook_id;
    if (volume) return volume === target.bookId && (!start || start.textbook_id !== volume || target.unitNo >= start.unit_no);
    return !!series && series === target.seriesId;
  };
  return matches(profile.start_series_id, profile.start_volume_id, profile.start_unit_id) ||
    (profile.track_b_enabled && matches(profile.track_b_series_id, profile.track_b_volume_id, profile.track_b_unit_id));
}