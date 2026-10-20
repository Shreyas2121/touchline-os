# P06-G05 — Squad registration

## 1. Context and authority

- **Master plan:** `MASTER_PLAN.md` version `1.0.0`, §5.2 `REGISTRATION_QUOTA`, §5.5, and §7.5.
- **Parent phase:** `plans/phase6.md`, guide **P06-G05**. Codes, exemption, and the command-center figure are phase §5 “Registration”.
- **Predecessor guide:** `plans/phase6/guide4.md`.
- **Predecessor commit:** the commit whose subject is `feat(p06-g04): govern contract decisions`. Verify with `git log --grep="feat(p06-g04): govern contract decisions" -1 --format=%H`. Later docs commits may sit on top of it. Do not reset them.
- **Commit subject:** `feat(p06-g05): validate squad registration`.

Precedence on conflict: `MASTER_PLAN.md` → `plans/phase6.md` → this guide. This guide adds the registration action. It does not change the sell-to-buy, age, wage, or prestige messages. It does not certify a real competition.

## 2. Goal and user-observable result

Registration lists the managed squad and can confirm a selected eligibility list.

- A missing required flag or a broken quota writes nothing.
- A valid list stores `user-entered` rows and survives reload.
- The command center shows `0 / 25` on Balanced before the first confirm, and `Unknown` when no constitution exists.
- Registration no longer shows `Static preview — not save data`. Scouting still does.

## 3. Preconditions

- Working directory is the repository root.
- `git merge-base --is-ancestor <P06-G04 sha> HEAD` succeeds, using the SHA from §1.
- `parsePolicyAction({ type: 'registration' })` currently returns `ok: false`. This guide is the one that changes that.
- The constitution already stores `REGISTRATION_QUOTA`. Do not add a rule field or a Dexie version.
- Do not install a package. Do not edit `schemaV1` or `DATABASE_VERSION`.
- Leave `MASTER_PLAN.md` and `plans/phase6.md` unchanged in this commit. Stage this guide only, not the other uncommitted Phase 6 guides.

## 4. Files to inspect

These files exist. Read them before editing:

- `plans/phase6.md` §5 “Registration” and the `P06-G05` block in §6.
- `src/domain/rules/types.ts` — `PolicyAction` and `RuleVerdict.ruleId`. The evidence value type already allows string or null.
- `src/domain/rules/evaluate-action.ts` — add a branch. Do not reorder the existing verdicts for the other actions.
- `src/domain/rules/presets.ts` — Balanced roster 25, homegrown 8, age exemption 21, competition `league`.
- `src/domain/validation/schemas.ts` — `registrationSchema` and the unique key already in `schemaV1`.
- `src/test/constitution-presets.test.ts` and `src/test/evaluate-action.test.ts` — both expect `{ type: 'registration' }` to fail. Update those assertions in this guide.
- `src/features/constitution/ConstitutionPage.tsx` — the registration description sentence.
- `src/test/finance-page.test.tsx` — it asserts the old description, and it witnesses the banner on Registration after `P06-G01`.
- `src/test/command-center.test.tsx` — Balanced registration is `Unknown`. The unadopted demo has three `Unknown` values.
- `e2e/smoke.spec.ts` — Harbor's command center expects exactly two `Unknown` texts. This guide makes registration `0 / 25`, so the count becomes 1.
- `src/app/layout/WorkspaceLayout.tsx` — `/registration` still shows the banner.

## 5. Files to create/modify

| Path | Role |
| --- | --- |
| `src/domain/rules/types.ts` | Registration action and rule id |
| `src/domain/rules/evaluate-action.ts` | Six registration codes |
| `src/data/repositories/registrations.ts` | List, insert, update |
| `src/data/commands/save-registration.ts` | `saveRegistration` |
| `src/features/registration/RegistrationList.tsx` | Squad eligibility form |
| `src/features/registration/RegistrationPage.tsx` | Replace the empty preview |
| `src/features/constitution/ConstitutionPage.tsx` | One sentence |
| `src/features/dashboard/CommandCenterPage.tsx` | `n / rosterLimit` |
| `src/app/layout/WorkspaceLayout.tsx` | Hide the banner on `/registration` |
| `src/domain/validation/schemas.ts` | Audit type `registration.save` only |
| `src/test/registration.test.ts` | Quota and rollback |
| Banner witnesses and the two parse tests | Scouting becomes the witness |
| `README.md` | Registration saves |

### Public API

Add this member to `PolicyAction`:

```ts
{
  type: 'registration'
  competitionKey: string
  players: {
    playerId: string
    status: 'registered' | 'ineligible' | 'unknown'
    homegrownClub: boolean | null
    homegrownNation: boolean | null
    ageExempt: boolean | null
    age: number | null
  }[]
}
```

`RuleVerdict.ruleId` gains `'REGISTRATION_QUOTA'`.

```ts
export function saveRegistration(
  database: TouchlineDatabase,
  input: unknown,
): Promise<CommandResult<{ count: number }>>
```

Strict input: `campaignId`, `seasonId`, `competitionKey`, `expectedRevision`, `now`, `auditEventId`, `actionId`, and `players`. Each player has `playerId`, `registrationId`, `status`, `homegrownClub`, `homegrownNation`, and `ageExempt`. The command recomputes age. The input has no age field.

`listRegistrations(database, campaignId, seasonId, competitionKey)` returns that scope only.

## 6. Implementation steps

1. Extend `parsePolicyAction`. `players` is an array. `playerId` is an entity id string of 1–64 characters matching the existing id pattern. Status is the registration enum. Flags are boolean or null. `age` is an integer 0–99 or null. Unknown keys fail. The four older action fixtures still parse. `{ type: 'registration' }` now parses.
2. In `evaluateAction`, when the action type is `registration`, find `REGISTRATION_QUOTA`. A missing rule, a disabled rule, or a `competitionKey` other than the rule's key adds no registration verdict. Do not let a disabled rule fall through into another rule.
3. When the rule is enabled and the key matches, collect every matching verdict. Do not stop after the first block. Apply phase §5 in this order:
   - Duplicate `playerId`: one `DUPLICATE_PLAYER`.
   - Each `unknown` status: `INSUFFICIENT_DATA` with message `Registration status is unknown.`
   - A `registered` player is age-exempt when `ageExempt === true`, or when `ageExempt` is null and `age` is a number and `ageExemptionUnder` is non-null and `age < ageExemptionUnder`. `ageExempt: false` is not exempt. Age 21 is not exempt when the threshold is 21. When exemption cannot be decided, `INSUFFICIENT_DATA` with message `Age is unknown, so this registration cannot be checked.`
   - A non-exempt registered player with neither homegrown flag true, and either flag null: `INSUFFICIENT_DATA` with message `Homegrown eligibility is unknown.`
   - Non-exempt registered count above `rosterLimit` is `ROSTER_ABOVE_LIMIT`. Homegrown count among those non-exempt registered players below `minimumHomegrown` is `HOMEGROWN_BELOW_MINIMUM`. A player who already produced `INSUFFICIENT_DATA` for an unknown flag is not counted as homegrown and is not counted in the roster total.
   - `ineligible` does not count. Either homegrown flag `true` counts as homegrown. Both `false` is a known non-homegrown player.
   Use the exact messages and remedies in phase §5. Evidence includes the numbers named in the message. Player ids in evidence are strings. The command still throws only the first blocking message and writes nothing.
4. `saveRegistration` refuses a missing constitution with `PersistenceError('SCOPE', 'Save a constitution before registering a squad.')`. When the stored registration rule's `competitionKey` differs from the input, throw `PersistenceError('SCOPE', 'Registration uses the constitution competition.')`. A disabled matching rule stores the rows and is not evaluated. An enabled rule evaluates the payload after ages are replaced with `displayAge`. Any block throws the first blocking verdict message and writes nothing.
5. Every selected player must currently be at the managed club. Otherwise `That player is not at the managed club.` The payload is the selection only. Players left off are not a blocker.
6. After evaluation, in the same transaction:
   - For each selected player, update the existing row for this campaign, season, competition, and player. If that row exists and `registrationId` is not its id, the result is `DUPLICATE` from the constraint or `VALIDATION` with message `A row with this id already exists.` If no row exists, insert `registrationId`. `provenance` is `user-entered`.
   - For a stored row in this season and competition whose player is still at the managed club and is absent from the selection, set `status` to `ineligible` and `provenance` to `user-entered`.
   - Do not delete departed players' rows. Do not change lineups.
   - One audit, `registration.save`, summary `Saved registration for ${competitionKey}`.
7. The read model for the command center counts `registered` rows in the active season for the rule's `competitionKey` whose player is still at the managed club. A sold player's old row does not count. When the rule is enabled, the KPI is `${count} / ${rosterLimit}`. When there is no constitution or the rule is disabled, the KPI stays `Unknown`. Do not render `Blocked` on the command center.
8. Registration page lists `listPlayersByClub` for the managed club only, not `listPlayers` for the whole campaign. Each row has legend equal to the player name, a status select labeled `Status for ${name}` with `Registered`, `Ineligible`, and `Unknown`, and checkboxes `Homegrown at club`, `Homegrown in nation`, and `Age exempt`. An unchecked box submits null, not false, until the user has touched it. After a touch, checked is true and unchecked is false. Button `Preview registration`. Button `Confirm registration`, disabled while the latest preview has a `BLOCK` or while a save is in flight.
9. The preview result includes `Preview only — no changes recorded.` Verdicts use `StatusPill`. No block shows `No rule blocked this action.` The page sentence is `These checks are your saved challenge rules. They do not certify a real competition.` Success text is `Saved registration.` Link `Change a rule on Constitution.` goes to the constitution route and does not change a rule.
10. Replace the constitution description `Registration checks are saved here and are not enforced in this build.` with `Registration checks run on the Registration screen when this rule is on.`
11. Hide `previewBanner` on paths ending in `/registration`. Move the banner witness from Registration to Scouting in `shell-nav.test.tsx`, `finance-page.test.tsx`, and the four e2e specs. Scouting's heading is `Scouting`. Smoke's Harbor command center changes `getByText('Unknown', { exact: true })` from count 2 to count 1, and expects `0 / 25`. The unadopted demo still has three `Unknown` values and no `€`.
12. Extend the README write list with saving a registration. Remove registration from the preview sentence. Scouting, matches, seasons, import, and backup remain previews.

## 7. Tests to add/change

`src/test/registration.test.ts`:

- Eight distinct homegrown non-exempt registered players, roster limit 25, minimum 8, ages 24, `ageExempt: null`: `evaluateAction` returns `allowed: true` and no verdicts. `saveRegistration` writes eight rows, provenance `user-entered`, and one audit whose summary is `Saved registration for league`.
- A list of 9 non-exempt registered players against a stored limit of 8 returns `ROSTER_ABOVE_LIMIT` and writes nothing. Use a constitution saved through `saveConstitution` with that limit, not a second evaluator.
- Seven homegrown players against minimum 8 returns `HOMEGROWN_BELOW_MINIMUM` and writes nothing.
- A null homegrown pair on one non-exempt registered player returns `INSUFFICIENT_DATA` and message `Homegrown eligibility is unknown.` The same list with `homegrownClub: true` then saves.
- Age 20 and `ageExempt: null` is exempt when the threshold is 21 and does not count toward the roster or the homegrown minimum. Age 21 counts. `ageExempt: false` counts at age 18.
- A disabled registration rule stores the rows and the report has no registration verdict.
- After a player is sold with `recordTransfer`, that player's old `registered` row does not increase the command-center count.
- A second confirm that omits a still-rostered player sets that stored row to `ineligible`.
- Campaign B's `listRegistrations` does not include campaign A's rows.
- `{ type: 'registration', competitionKey: 'league', players: [] }` parses. The paid incoming fixture from `constitution-presets.test.ts` still parses.

Update `evaluate-action.test.ts` so the registration rejection assertion is replaced by a parsed registration action. Do not delete the other action cases.

Rendered page:

- Balanced Harbor shows `These checks are your saved challenge rules. They do not certify a real competition.`
- Preview of a selection that leaves status `Unknown` shows `Blocked` and `Registration status is unknown.` `Confirm registration` is disabled. The registration count stays 0.
- `/app/campaign-a/registration` has no preview banner. `/app/campaign-a/scouting` has it.
- The Balanced command center KPI `Registration` is `0 / 25` before any row. The container text still does not match `Blocked`.

## 8. Verification commands

Run from the repository root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Expected: each command exits 0. `pnpm test` includes the previous files plus `registration.test.ts`. Smoke's Harbor command center has one `Unknown` and shows `0 / 25`.

## 9. Manual acceptance check

1. On Balanced Harbor, open Registration. The preview banner is absent. The challenge-rules sentence is visible. The squad is empty, so preview the empty selection. `Homegrown players are below the minimum of 8.` is visible. `Confirm registration` is disabled.
2. On the fictional demo, after saving Balanced, open Registration. Leave one selected player on `Unknown` and preview. `Registration status is unknown.` is visible. Set that player to `Ineligible` or complete a valid homegrown list until `No rule blocked this action.` appears, then confirm. Reload. `Saved registration.` may be gone, and the rows remain. The command center figure is no longer `Unknown`.
3. Open Constitution. The registration sentence is `Registration checks run on the Registration screen when this rule is on.`
4. Open Scouting. The preview banner is visible. Open Transfers. There is no control that turns a rule off.
5. Tab to `Confirm registration` while a blocker is showing. The button is disabled, and the word `Blocked` is visible.

## 10. Definition of done

- [ ] `parsePolicyAction` accepts a registration action and still accepts the four older actions.
- [ ] A quota or missing-flag failure writes no registration row and no audit.
- [ ] A valid confirm stores `user-entered` rows.
- [ ] Age 20 is exempt, age 21 counts, and `ageExempt: false` counts.
- [ ] The command center shows `0 / 25` for enabled Balanced and `Unknown` without a constitution.
- [ ] The preview banner is on Scouting and not on Registration.
- [ ] Sell-to-buy, age, wage, and prestige messages are unchanged.
- [ ] `schemaV1` is unchanged. No package was added.
- [ ] The §8 commands exit 0.

## 11. Commit instructions

Stage the files in §5, and `plans/phase6/guide5.md` if it is still untracked.

Do not stage `node_modules`, `dist`, `MASTER_PLAN.md`, `plans/phase6.md`, or other Phase 6 guides.

Suggested message:

```text
feat(p06-g05): validate squad registration
```

Do not commit when §8 is failing. After the commit succeeds, record its full SHA on the `P06-G05` row of the progress log in `plans/phase6.md` §10. That log edit is not part of this commit.

## 12. Handoff

`P06-G06` locks the sale, the blocked purchase, the qualifying rejection, and this eligibility correction together. It must not change a registration threshold to make the journey pass.

Known limitations this guide leaves on purpose:

- Tactics does not require a player to be registered.
- Match entry does not exist.
- The command center figure is a count, not a verdict word.
