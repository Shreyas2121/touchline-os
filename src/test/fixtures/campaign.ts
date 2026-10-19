import {
  campaignSchema,
  clubSchema,
  seasonSchema,
} from '../../domain/validation/schemas'

const timestamp = '2026-10-19T00:00:00.000Z'
const date = '2026-10-19'

export const campaignA = campaignSchema.parse({
  id: 'campaign-a',
  name: 'Riverside',
  kind: 'fictional',
  seed: null,
  generatorVersion: null,
  managedClubId: 'club-a',
  activeSeasonId: 'season-a',
  currency: 'EUR',
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: 0,
})

export const campaignB = campaignSchema.parse({
  id: 'campaign-b',
  name: 'Hilltown',
  kind: 'fictional',
  seed: null,
  generatorVersion: null,
  managedClubId: 'club-b',
  activeSeasonId: 'season-b',
  currency: 'EUR',
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: 0,
})

export const clubA = clubSchema.parse({
  id: 'club-a',
  campaignId: 'campaign-a',
  leagueId: null,
  name: 'Riverside Athletic',
  shortName: 'RIV',
  colors: { primary: '#113355', secondary: '#D4A017' },
  prestige: 40,
  academyTier: 3,
  scoutingRegion: null,
})

export const clubB = clubSchema.parse({
  id: 'club-b',
  campaignId: 'campaign-b',
  leagueId: null,
  name: 'Hilltown',
  shortName: 'HIL',
  colors: { primary: '#224466', secondary: '#88AACC' },
  prestige: 20,
  academyTier: 2,
  scoutingRegion: null,
})

export const seasonA = seasonSchema.parse({
  id: 'season-a',
  campaignId: 'campaign-a',
  label: 'Season 1',
  ordinal: 1,
  status: 'active',
  startDate: date,
  endDate: null,
  openedAt: timestamp,
  closedAt: null,
})

export const seasonB = seasonSchema.parse({
  id: 'season-b',
  campaignId: 'campaign-b',
  label: 'Season 1',
  ordinal: 1,
  status: 'active',
  startDate: date,
  endDate: null,
  openedAt: timestamp,
  closedAt: null,
})
