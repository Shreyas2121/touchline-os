export const pitch =
  'Touchline OS is an offline-first sporting-director workspace for players managing a football career in another game: track a club, enforce self-imposed rules, plan squads and transfers, analyze finances, and document each season — without simulating matches.'

export const disclaimer =
  'Unofficial fan-made companion; not affiliated with any football game, team or league.'

export const previewBanner = 'Static preview — not save data'

export const missingCampaignTitle = 'Campaign not found'

export const notFoundTitle = 'Page not found'

export const loadingCampaign = 'Loading campaign.'
export const loadingSquad = 'Loading squad.'
export const squadFailed =
  'This squad could not be loaded. Reload and try again.'
export const databaseUnavailable = 'This browser cannot open a local database.'
export const seedReady = 'Fictional world ready.'
export const seedFailed =
  'The demo could not be saved. Retry to continue this world.'
export const seedVersionMismatch =
  'This demo was built with a different world version. Reset the fictional demo to replace it. Other saves are kept.'
export const staleSave =
  'This save changed in another tab. Reload and try again.'
export const archivedDemo = 'The fictional demo is archived.'
export const resetPhrase = 'Reset fictional demo'
export const resetHelp = 'Reset replaces the fictional demo. Other saves stay.'
export const archiveHelp =
  'Archive hides this save. You can restore it. This does not delete the save.'
export const deleteHelp = 'Delete removes this save. This cannot be undone.'
export const saveFailed = 'The campaign could not be saved. Try again.'
export function careerProgress(stage: 'generate' | 'save' | 'ready'): string {
  if (stage === 'generate') return 'Building the world.'
  if (stage === 'save') return 'Saving the career.'
  return 'Career ready.'
}

export function seedProgress(
  stage: string,
  done: number,
  total: number,
): string {
  return `Seeding fictional world. ${stage} ${done} of ${total}.`
}

export const importPanel = 'Import is not available in this build.'

export function exportOrigin(origin: string): string {
  return `This browser origin is ${origin}. Export for Desktop reads only the saves stored at this origin. Opening the app at another address uses a different, empty database.`
}

export const exportEmpty =
  'No campaign is saved at this origin. A campaign created at another address is not here.'

export const exportMissing =
  'That campaign is not in the database at this origin. It may have been deleted, or it belongs to another address.'

export const exportLocal =
  'The download stays on this computer. Export does not change the saved campaign.'

export const exportReading = 'Reading the campaign.'

export const exportPreparing = 'Checking the snapshot.'

export const exportStarted =
  'Download started on this computer. The saved campaign was not changed.'

export const exportFailed = 'Export failed. The saved campaign was not changed.'

export const exportCancelled =
  'Export cancelled. The saved campaign was not changed.'

export const searchPanel = 'Search is not available in this build.'

export const backupPanel = 'Backup is not available in this build.'

export const loadingConstitution = 'Loading constitution.'
export const constitutionFailed =
  'This constitution could not be loaded. Reload and try again.'
export const loadingFinance = 'Loading finance.'
export const financeFailed =
  'This finance page could not be loaded. Reload and try again.'

export const noRecords = 'This build does not store records.'

export const previewValue = 'Preview'

export const loadingTactics = 'Loading tactics.'
export const tacticsFailed =
  'This tactics board could not be loaded. Reload and try again.'
export const lineupDiscardWarning =
  'Choosing another lineup discards unsaved changes.'
export const lineupRosterMismatch =
  'This lineup does not match the current roster.'
export const loadingLineups = 'Loading saved lineups.'
export const lineupsFailed =
  'Saved lineups could not be loaded. Reload and try again.'
export function lineupSaved(name: string): string {
  return `Saved lineup ${name}.`
}
export function lineupDeleted(name: string): string {
  return `Deleted lineup ${name}.`
}

export const settingsBody =
  'The appearance is the dark terminal theme. Motion follows the operating system. Preferences are not saved.'

export const helpProvenance =
  'This screen is a static shell and contains no club or player records.'

export const missingCampaignBody = 'This address does not include a campaign.'

export const notFoundBody = 'This address does not match a page in this build.'

export const backToWelcome = 'Back to welcome'
