export type WorkspaceSectionId =
  | 'command-center'
  | 'squad'
  | 'tactics'
  | 'transfers'
  | 'finance'
  | 'registration'
  | 'scouting'
  | 'matches'
  | 'seasons'
  | 'constitution'

export type WorkspaceSection = {
  id: WorkspaceSectionId
  label: string
  segment: string
}

export const workspaceSections = [
  { id: 'command-center', label: 'Command Center', segment: 'command-center' },
  { id: 'squad', label: 'Squad', segment: 'squad' },
  { id: 'tactics', label: 'Tactics', segment: 'tactics' },
  { id: 'transfers', label: 'Transfers', segment: 'transfers' },
  { id: 'finance', label: 'Finance', segment: 'finance' },
  { id: 'registration', label: 'Registration', segment: 'registration' },
  { id: 'scouting', label: 'Scouting', segment: 'scouting' },
  { id: 'matches', label: 'Match Journal', segment: 'matches' },
  { id: 'seasons', label: 'Seasons', segment: 'seasons' },
  { id: 'constitution', label: 'Constitution', segment: 'constitution' },
] as const satisfies readonly WorkspaceSection[]

const workspaceSectionIds = new Set<string>(
  workspaceSections.map((section) => section.segment),
)

export function isWorkspaceSection(
  segment: string,
): segment is WorkspaceSectionId {
  return workspaceSectionIds.has(segment)
}

export function workspaceSectionPath(
  campaignId: string,
  sectionId: WorkspaceSectionId,
): string {
  const section = workspaceSections.find((item) => item.id === sectionId)

  if (!section) {
    throw new Error(`Unknown section: ${sectionId}`)
  }

  return `/app/${campaignId}/${section.segment}`
}
