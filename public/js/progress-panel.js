// Requirements and planning are inspections; circle/train/raise never belong here.
export const PROGRESS_TABS = Object.freeze(['progress', 'training']);
export function progressTab(key) { return key === 'training' ? key : 'progress'; }
export function nextProgressTab(current, key) {
  if (key === 'Home') return 'progress';
  if (key === 'End') return 'training';
  return progressTab(current) === 'progress' ? 'training' : 'progress';
}
