import { workspaceSections as sharedSections } from '../routes'
export const workspaceSections = sharedSections.map((section) =>
  section.id === 'matches'
    ? { ...section, label: 'Fixtures & Results' }
    : section,
)
export const readOnly =
  'Standalone career management is available. Continue on the Command Center advances the foundation calendar. Match simulation and negotiations arrive in later phases.'
