import {
  addDays,
  ageInWholeYears,
  parseDateOnly,
  timestampUtcSchema,
  type DateOnly,
} from '../models/dates'
import { formatMoneyEuros, parseMoneyCents } from '../models/money'
import { constitutionPreset } from '../rules/presets'
import { evaluateAction } from '../rules/evaluate-action'
import {
  GENERATOR_VERSION,
  generateWorld,
  type GeneratedWorld,
} from '../seed/generate-world'
import {
  PLAYABLE_GENERATOR_VERSION,
  generatePlayableWorld,
} from '../seed/generate-playable-world'
import type { PlayableWorld } from '../seed/playable-world-validation'
import { hashSeed, mulberry32, nextInt } from '../seed/prng'
import {
  activeTransferWindow,
  previewTimeAdvance,
  seasonDates,
  transferWindowOn,
} from '../simulation/calendar'
import {
  careerFingerprint,
  prepareStandaloneCareer,
  type PreparedCareer,
} from '../simulation/career'
import {
  createEventStream,
  deriveEventSeed,
  eventStreamKey,
  simulationEventKinds,
} from '../simulation/random'
import {
  constitutionSchema,
  entityIdSchema,
  seasonSchema,
} from '../validation/schemas'
import { simulationStateSchema } from '../simulation/schemas'
import { sha256Utf8 } from './digest'

export const compatibilitySeeds = [
  { label: 'ascii', seed: 'touchline-demo-v1' },
  { label: 'non-ascii', seed: 'café-München' },
  { label: 'astral', seed: 'astral-😀-𐍈' },
] as const

const vectorCampaignId = 'vector-world'
const careerCampaignId = 'vector-career'
const vectorNow = '2026-07-01T00:00:00.000Z'

export const determinismRecipe = {
  hash: 'hashSeed is FNV-1a over the UTF-16 code units of generatorVersion, a NUL, and the seed, using Math.imul wrapping uint32 arithmetic.',
  prng: 'mulberry32(hash) is sampled twice from a fresh stream: four unit-interval draws stored as big-endian IEEE-754 float64 hex, then four nextInt(rng, 10) results from another fresh stream.',
  streams:
    'eventStreamKey and deriveEventSeed use simulation version 1. Logical keys are the empty list and matchday:1. No database ids or clock time are included.',
  fingerprints:
    'careerFingerprint is the JSON array standalone-career, generator 2, name, seed, start year, club key, rules mode, and preset.',
  dates:
    'seasonDates, addDays, transferWindowOn, ageInWholeYears, and previewTimeAdvance are called with the fixed inputs below. No ambient clock is read.',
  money:
    'parseMoneyCents and formatMoneyEuros use the existing euro parser. Amounts stay in integer cents.',
  policy:
    'evaluateAction uses the balanced and strict constitution presets. Reports are the full verdict objects.',
} as const

export const generatorRecipe = {
  canonicalJson:
    'SHA-256 of the UTF-8 bytes of JSON.stringify(value), using the generator object key insertion order and no extra whitespace.',
  independence:
    'These digests are the TypeScript oracle. Do not replace them with Rust output. A behavior change needs an explicit version decision.',
  generatorV1:
    'generateWorld generator version 1 and campaign id vector-world.',
  generatorV2:
    'generatePlayableWorld generator version 2, campaign id vector-world, start year 2026. The draw stream is world/playable-world:2 and ignores the campaign id.',
  preparedCareer:
    'prepareStandaloneCareer for each seed at club:01, year 2026, with the listed rules. The world is digested. The career shell is stored in full and excludes the world rows.',
} as const

function requireDate(input: string): DateOnly {
  const parsed = parseDateOnly(input)
  if (!parsed.ok) throw new Error(parsed.message)
  return parsed.value
}

function float64Hex(value: number): string {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, value)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function draws(seed: number): {
  unitIntervalHex: string[]
  nextInt10: number[]
} {
  const unit = mulberry32(seed)
  const unitIntervalHex = [unit(), unit(), unit(), unit()].map(float64Hex)
  const indexed = mulberry32(seed)
  const nextInt10 = [
    nextInt(indexed, 10),
    nextInt(indexed, 10),
    nextInt(indexed, 10),
    nextInt(indexed, 10),
  ]
  return { unitIntervalHex, nextInt10 }
}

export function buildDeterminismVector() {
  const hashCases = compatibilitySeeds.flatMap(({ label, seed }) =>
    [GENERATOR_VERSION, PLAYABLE_GENERATOR_VERSION].map((generatorVersion) => {
      const hash = hashSeed(seed, generatorVersion)
      return { label, seed, generatorVersion, hash, ...draws(hash) }
    }),
  )
  const streamCases = compatibilitySeeds.flatMap(({ label, seed }) =>
    simulationEventKinds.flatMap((eventKind) =>
      [[], ['matchday:1']].map((logicalKeys) => ({
        label,
        seed,
        eventKind,
        logicalKeys,
        streamKey: eventStreamKey(seed, '1', eventKind, logicalKeys),
        eventSeed: deriveEventSeed(seed, '1', eventKind, logicalKeys),
        firstDrawHex: float64Hex(
          createEventStream(seed, '1', eventKind, logicalKeys)(),
        ),
      })),
    ),
  )
  const fingerprintCases = compatibilitySeeds.flatMap(({ label, seed }) =>
    (
      [
        ['challenge', 'balanced'],
        ['sandbox', 'strict'],
      ] as const
    ).map(([rulesMode, preset]) => ({
      label,
      seed,
      rulesMode,
      preset,
      fingerprint: careerFingerprint({
        name: 'Vector career',
        seed,
        startYear: 2026,
        clubKey: 'club:01',
        rulesMode,
        preset,
      }),
    })),
  )
  const leapBirth = requireDate('2000-02-29')
  const beforeBirthday = requireDate('2024-02-28')
  const onBirthday = requireDate('2024-02-29')
  const season = seasonSchema.parse({
    id: 'vector-season',
    campaignId: 'vector-world',
    label: '2026/27',
    ordinal: 1,
    status: 'active',
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    openedAt: vectorNow,
    closedAt: null,
  })
  const preseason = simulationStateSchema.parse({
    id: 'vector-clock',
    campaignId: 'vector-world',
    activeSeasonId: season.id,
    rootSeed: 'touchline-demo-v1',
    simulationVersion: '1',
    calendarVersion: '1',
    currentDate: '2026-07-01',
    phase: 'preseason',
    lastBoundaryKey: null,
  })
  const atDeadline = simulationStateSchema.parse({
    ...preseason,
    currentDate: '2026-08-31',
    lastBoundaryKey: 'season:2026:summer-deadline',
  })
  const atKickoff = simulationStateSchema.parse({
    ...preseason,
    currentDate: '2026-09-01',
    phase: 'league',
    lastBoundaryKey: 'season:2026:league-kickoff',
  })
  const balanced = constitutionSchema.parse({
    id: 'vector-rules',
    campaignId: 'vector-world',
    version: 1,
    rules: constitutionPreset('balanced'),
    updatedAt: vectorNow,
  })
  const strict = constitutionSchema.parse({
    ...balanced,
    id: 'vector-rules-strict',
    rules: constitutionPreset('strict'),
  })
  const policyCases = [
    {
      name: 'fee-above-capacity',
      preset: 'balanced',
      report: evaluateAction(
        {
          type: 'incoming-transfer',
          feeCents: 2_000,
          age: 24,
          isFree: false,
          weeklyWageCents: 100,
          squadTier: 'rotation',
        },
        { revision: 3, remainingCapacityCents: 1_000 },
        balanced,
        requireDate('2026-07-01'),
      ),
    },
    {
      name: 'free-transfer',
      preset: 'balanced',
      report: evaluateAction(
        {
          type: 'incoming-transfer',
          feeCents: 0,
          age: 30,
          isFree: true,
          weeklyWageCents: 100,
          squadTier: 'youth',
        },
        { revision: 3, remainingCapacityCents: 0 },
        balanced,
        preseason.currentDate,
      ),
    },
    {
      name: 'strict-age-cap',
      preset: 'strict',
      report: evaluateAction(
        {
          type: 'incoming-transfer',
          feeCents: 0,
          age: 24,
          isFree: true,
          weeklyWageCents: 100,
          squadTier: 'youth',
        },
        { revision: 4, remainingCapacityCents: 0 },
        strict,
        preseason.currentDate,
      ),
    },
    {
      name: 'wage-above-tier',
      preset: 'balanced',
      report: evaluateAction(
        {
          type: 'wage-change',
          weeklyWageCents: 9_000_000,
          squadTier: 'key',
        },
        { revision: 5, remainingCapacityCents: null },
        balanced,
        preseason.currentDate,
      ),
    },
    {
      name: 'qualifying-offer',
      preset: 'balanced',
      report: evaluateAction(
        {
          type: 'reject-offer',
          feeCents: 300,
          marketValueCents: 100,
          bidderPrestige: 80,
          sellerPrestige: 40,
        },
        { revision: 6, remainingCapacityCents: null },
        balanced,
        preseason.currentDate,
      ),
    },
    {
      name: 'registration-quota',
      preset: 'strict',
      report: evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: Array.from({ length: 21 }, (_, index) => ({
            playerId: `player-${index + 1}`,
            status: 'registered' as const,
            homegrownClub: false,
            homegrownNation: false,
            ageExempt: false,
            age: 24,
          })),
        },
        { revision: 7, remainingCapacityCents: null },
        strict,
        preseason.currentDate,
      ),
    },
  ]
  const moneyInputs = [
    '0',
    '0.1',
    '0.10',
    '€12.30',
    '1.234',
    '9999999999999.99',
    '10000000000000',
  ]
  return {
    recipe: determinismRecipe,
    seeds: compatibilitySeeds,
    hash: hashCases,
    streams: streamCases,
    fingerprints: fingerprintCases,
    dates: {
      seasons: [1900, 2024, 2026, 2198].map((year) => ({
        year,
        ...seasonDates(year),
      })),
      addDays: [
        {
          from: '2024-02-28',
          days: 1,
          result: addDays(requireDate('2024-02-28'), 1),
        },
        {
          from: '2023-02-28',
          days: 1,
          result: addDays(requireDate('2023-02-28'), 1),
        },
        {
          from: '1900-02-28',
          days: 1,
          result: addDays(requireDate('1900-02-28'), 1),
        },
        {
          from: '2026-08-31',
          days: 1,
          result: addDays(requireDate('2026-08-31'), 1),
        },
      ],
      windows: [
        '2026-06-30',
        '2026-07-01',
        '2026-08-31',
        '2026-09-01',
        '2026-01-01',
        '2026-01-31',
        '2026-02-01',
      ].map((date) => ({
        date,
        window: transferWindowOn(requireDate(date)),
      })),
      ages: [
        {
          birth: '2000-02-29',
          asOf: '2024-02-28',
          years: ageInWholeYears(leapBirth, beforeBirthday),
        },
        {
          birth: '2000-02-29',
          asOf: '2024-02-29',
          years: ageInWholeYears(leapBirth, onBirthday),
        },
      ],
      previews: [
        {
          name: 'opening',
          activeWindow: activeTransferWindow(preseason, season),
          preview: previewTimeAdvance(preseason, season),
        },
        {
          name: 'deadline-consumed',
          activeWindow: activeTransferWindow(atDeadline, season),
          preview: previewTimeAdvance(atDeadline, season),
        },
        {
          name: 'kickoff-consumed',
          activeWindow: activeTransferWindow(atKickoff, season),
          preview: previewTimeAdvance(atKickoff, season),
        },
      ],
    },
    money: moneyInputs.map((input) => {
      const parsed = parseMoneyCents(input)
      return parsed.ok
        ? {
            input,
            ok: true,
            cents: parsed.value,
            text: formatMoneyEuros(parsed.value),
          }
        : { input, ok: false, message: parsed.message }
    }),
    policy: policyCases,
  }
}

async function digestValue(
  value: unknown,
): Promise<{ sha256: string; utf8Bytes: number }> {
  const text = JSON.stringify(value)
  const sha256 = await sha256Utf8(text)
  return { sha256, utf8Bytes: new TextEncoder().encode(text).length }
}

function worldAnchors(world: GeneratedWorld) {
  const firstClub = world.clubs[0]
  const lastClub = world.clubs[world.clubs.length - 1]
  const firstPlayer = world.players[0]
  const lastPlayer = world.players[world.players.length - 1]
  if (!firstClub || !lastClub || !firstPlayer || !lastPlayer) {
    throw new Error('Generated world is empty.')
  }
  return {
    counts: {
      leagues: world.leagues.length,
      clubs: world.clubs.length,
      players: world.players.length,
    },
    firstClub: {
      id: firstClub.id,
      name: firstClub.name,
      shortName: firstClub.shortName,
      prestige: firstClub.prestige,
    },
    lastClub: { id: lastClub.id, name: lastClub.name },
    firstPlayer: {
      id: firstPlayer.id,
      name: firstPlayer.name,
      reportedAge: firstPlayer.reportedAge,
      marketValueCents: firstPlayer.marketValueCents,
      weeklyWageCents: firstPlayer.weeklyWageCents,
    },
    lastPlayer: {
      id: lastPlayer.id,
      name: lastPlayer.name,
      clubId: lastPlayer.clubId,
    },
  }
}

function playableAnchors(world: PlayableWorld) {
  const firstClub = world.clubs[0]
  const lastPlayer = world.players[world.players.length - 1]
  const firstContract = world.contracts[0]
  const firstClubState = world.clubSimulationStates[0]
  if (!firstClub || !lastPlayer || !firstContract || !firstClubState) {
    throw new Error('Playable world is empty.')
  }
  return {
    counts: {
      leagues: world.leagues.length,
      clubs: world.clubs.length,
      players: world.players.length,
      contracts: world.contracts.length,
      clubSimulationStates: world.clubSimulationStates.length,
      playerSimulationStates: world.playerSimulationStates.length,
    },
    firstClub: {
      id: firstClub.id,
      name: firstClub.name,
      shortName: firstClub.shortName,
      prestige: firstClub.prestige,
    },
    lastPlayer: {
      id: lastPlayer.id,
      name: lastPlayer.name,
      clubId: lastPlayer.clubId,
    },
    firstContract: {
      id: firstContract.id,
      weeklyWageCents: firstContract.weeklyWageCents,
      squadTier: firstContract.squadTier,
    },
    firstClubState: {
      simulationKey: firstClubState.simulationKey,
      transferBalanceCents: firstClubState.transferBalanceCents,
    },
  }
}

function careerShell(career: PreparedCareer) {
  return {
    fingerprint: career.fingerprint,
    campaign: career.campaign,
    season: career.season,
    clock: career.clock,
    constitution: career.constitution,
    allocation: career.allocation,
    receipt: career.receipt,
    audit: career.audit,
  }
}

export async function buildGeneratorVector() {
  const generatorV1 = []
  for (const { label, seed } of compatibilitySeeds) {
    const generated = generateWorld({
      seed,
      generatorVersion: GENERATOR_VERSION,
      campaignId: vectorCampaignId,
    })
    if (!generated.ok) throw new Error(generated.message)
    generatorV1.push({
      label,
      seed,
      generatorVersion: GENERATOR_VERSION,
      campaignId: vectorCampaignId,
      ...worldAnchors(generated.value),
      ...(await digestValue(generated.value)),
    })
  }
  const generatorV2 = []
  for (const { label, seed } of compatibilitySeeds) {
    const generated = generatePlayableWorld({
      seed,
      generatorVersion: PLAYABLE_GENERATOR_VERSION,
      campaignId: vectorCampaignId,
      startYear: 2026,
    })
    if (!generated.ok) throw new Error(generated.message)
    generatorV2.push({
      label,
      seed,
      generatorVersion: PLAYABLE_GENERATOR_VERSION,
      campaignId: vectorCampaignId,
      startYear: 2026,
      ...playableAnchors(generated.value),
      ...(await digestValue(generated.value)),
    })
  }
  const preparedCareers = []
  const careers = [
    ...compatibilitySeeds.map(({ label, seed }) => ({
      label,
      seed,
      rulesMode: 'challenge' as const,
      preset: 'balanced' as const,
    })),
    {
      label: 'ascii-sandbox',
      seed: 'touchline-demo-v1',
      rulesMode: 'sandbox' as const,
      preset: 'strict' as const,
    },
  ]
  for (const career of careers) {
    const prepared = prepareStandaloneCareer({
      campaignId: entityIdSchema.parse(careerCampaignId),
      name: 'Vector career',
      seed: career.seed,
      startYear: 2026,
      clubKey: 'club:01',
      rulesMode: career.rulesMode,
      preset: career.preset,
      now: timestampUtcSchema.parse(vectorNow),
      seasonId: entityIdSchema.parse('vector-career-season'),
      clockId: entityIdSchema.parse('vector-career-clock'),
      constitutionId: entityIdSchema.parse('vector-career-rules'),
      allocationId: entityIdSchema.parse('vector-career-allocation'),
      receiptId: entityIdSchema.parse('vector-career-receipt'),
      auditEventId: entityIdSchema.parse('vector-career-audit'),
      actionId: entityIdSchema.parse('vector-career-action'),
    })
    if (!prepared.ok) throw new Error(prepared.message)
    preparedCareers.push({
      label: career.label,
      seed: career.seed,
      rulesMode: career.rulesMode,
      preset: career.preset,
      shell: careerShell(prepared.value),
      world: {
        ...playableAnchors(prepared.value.world),
        ...(await digestValue(prepared.value.world)),
      },
    })
  }
  return {
    recipe: generatorRecipe,
    seeds: compatibilitySeeds,
    generatorV1,
    generatorV2,
    preparedCareers,
  }
}
