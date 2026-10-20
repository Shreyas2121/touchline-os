export type RegistrationDraft = {
  status: 'unknown'
  homegrownClub: boolean | null
  homegrownNation: boolean | null
  ageExempt: boolean | null
}

export function unsavedRegistrationDraft(
  player: { reportedAge: number | null },
  profile: { homegrownClub: boolean; homegrownNation: boolean } | undefined,
): RegistrationDraft {
  if (!profile) {
    return {
      status: 'unknown',
      homegrownClub: null,
      homegrownNation: null,
      ageExempt: null,
    }
  }
  return {
    status: 'unknown',
    homegrownClub: profile.homegrownClub,
    homegrownNation: profile.homegrownNation,
    ageExempt: player.reportedAge === null ? null : player.reportedAge < 21,
  }
}
