export type NewPaneField = 'prompt' | 'baseBranch' | 'branchName';

export function getNextNewPaneField(current: NewPaneField): NewPaneField {
  if (current === 'prompt') return 'baseBranch';
  if (current === 'baseBranch') return 'branchName';
  return 'prompt';
}

export function getPreviousNewPaneField(current: NewPaneField): NewPaneField {
  if (current === 'prompt') return 'branchName';
  if (current === 'baseBranch') return 'prompt';
  return 'baseBranch';
}
