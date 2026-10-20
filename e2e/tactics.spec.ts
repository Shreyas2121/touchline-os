import { expect, test, type Locator } from '@playwright/test'
import { missingCampaignTitle, previewBanner } from '../src/app/copy.ts'

async function expectPlayer(slot: Locator, name: string) {
  await expect.poll(() => slot.getAttribute('aria-label')).toContain(name)
}

test('keyboard lineups persist, switch and delete within their campaign', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('button', { name: 'Try fictional demo' }).click()
  await page.getByRole('button', { name: 'Ashbridge', exact: true }).click()
  await page.getByRole('link', { name: 'Squad', exact: true }).click()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(
    page.getByRole('img', { name: 'Ashbridge crest', exact: true }),
  ).toBeVisible()
  const firstSelection = page.getByRole('button', { name: /^Select / }).first()
  await expect(firstSelection).toBeVisible()
  await expect(
    firstSelection.locator('xpath=ancestor::tr').locator('td').nth(3),
  ).toHaveText('Unknown')
  const squadName = (await firstSelection.getAttribute('aria-label'))!.replace(
    /^Select /,
    '',
  )
  await page.getByLabel('Search players', { exact: true }).fill(squadName)
  await expect(
    page.getByRole('button', { name: `Select ${squadName}`, exact: true }),
  ).toBeVisible()
  await page.getByLabel('Search players', { exact: true }).fill('zzzz')
  await expect(page.getByText('No players match this search.')).toBeVisible()
  await page.getByLabel('Search players', { exact: true }).fill('')
  await page
    .getByRole('button', { name: `Select ${squadName}`, exact: true })
    .click()
  const profile = page.getByRole('region', {
    name: 'Selected player',
    exact: true,
  })
  const pace = profile
    .locator('dl div')
    .filter({ has: page.locator('dt', { hasText: /^Pace$/ }) })
    .locator('dd')
  const originalPace = await pace.innerText()
  await profile.getByLabel('Market value', { exact: true }).fill('')
  await profile
    .getByRole('button', { name: 'Save player', exact: true })
    .click()
  await expect(profile.getByText('Player updated.')).toBeVisible()
  await profile
    .getByLabel('Development notes', { exact: true })
    .fill('Hold the ball')
  await profile.getByRole('button', { name: 'Save note', exact: true }).click()
  await expect(profile.getByText('Development note saved.')).toBeVisible()
  await page.reload()
  await page
    .getByRole('button', { name: `Select ${squadName}`, exact: true })
    .click()
  await expect(profile.getByLabel('Market value', { exact: true })).toHaveValue(
    '',
  )
  await expect(
    profile.getByLabel('Development notes', { exact: true }),
  ).toHaveValue('Hold the ball')
  await expect(pace).toHaveText(originalPace)
  await expect(
    profile.getByText(
      'Source stays Fictional. This correction is recorded in activity.',
    ),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Tactics', exact: true }).click()
  await expect(
    page.getByRole('img', { name: 'Pitch', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  const roster = page.getByRole('list', { name: 'Roster', exact: true })
  const slots = page.getByRole('group', { name: 'Pitch slots', exact: true })
  const first = roster.getByRole('button').nth(0)
  const second = roster.getByRole('button').nth(1)
  const firstName = await first.innerText()
  const secondName = await second.innerText()
  const gk = slots.getByRole('button', { name: /^GK,/ })
  const rb = slots.getByRole('button', { name: /^RB,/ })
  const st = slots.getByRole('button', { name: /^ST,/ })
  await first.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText(`Holding ${firstName}`, { exact: true }),
  ).toBeVisible()
  await gk.focus()
  await page.keyboard.press('Enter')
  await expectPlayer(gk, firstName)
  await second.focus()
  await page.keyboard.press('Enter')
  await rb.focus()
  await page.keyboard.press('Enter')
  await expectPlayer(rb, secondName)
  await page.getByLabel('Lineup name', { exact: true }).fill('League XI')
  await page.getByRole('button', { name: 'Save lineup', exact: true }).click()
  await expect(
    page.getByText('Saved lineup League XI.', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/\/tactics$/)
  await expect(page.getByLabel('Lineup name', { exact: true })).toHaveValue(
    'League XI',
  )
  await expectPlayer(gk, firstName)
  await expectPlayer(rb, secondName)
  await page.screenshot({
    path: 'test-results/p04-g05-lineup.png',
    fullPage: true,
  })
  await first.click()
  await st.click()
  await expect(gk).toHaveAccessibleName('GK, empty')
  await expectPlayer(st, firstName)

  await page.getByRole('button', { name: 'New lineup', exact: true }).click()
  await first.click()
  await st.click()
  await page.getByLabel('Lineup name', { exact: true }).fill('Cup Rotation')
  await page.getByRole('button', { name: 'Save lineup', exact: true }).click()
  await expect(
    page.getByText('Saved lineup Cup Rotation.', { exact: true }),
  ).toBeVisible()
  const saved = page.getByLabel('Saved lineups', { exact: true })
  const leagueId = (await saved
    .getByRole('option', { name: 'League XI', exact: true })
    .getAttribute('value'))!
  const cupId = (await saved
    .getByRole('option', { name: 'Cup Rotation', exact: true })
    .getAttribute('value'))!
  await saved.selectOption(leagueId)
  await expectPlayer(gk, firstName)
  await expect(st).toHaveAccessibleName('ST, empty')
  await saved.selectOption(cupId)
  await expectPlayer(st, firstName)
  await page.getByRole('button', { name: 'Delete lineup', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('region', { name: 'Delete lineup', exact: true }),
  ).toHaveCount(0)
  await expect(
    saved.getByRole('option', { name: 'Cup Rotation', exact: true }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: 'Delete lineup', exact: true }).click()
  await page
    .getByRole('button', { name: 'Delete Cup Rotation', exact: true })
    .click()
  await expect(
    page.getByText('Deleted lineup Cup Rotation.', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Lineup name', { exact: true })).toHaveValue(
    'League XI',
  )
  await expect(
    saved.getByRole('option', { name: 'Cup Rotation', exact: true }),
  ).toHaveCount(0)
  await expectPlayer(gk, firstName)
  await page.getByLabel('Formation', { exact: true }).selectOption('4-4-2')
  await expect(
    page.getByText('Starting slots were cleared.', { exact: true }),
  ).toBeVisible()
  await expect(slots.getByRole('button', { name: /, empty$/ })).toHaveCount(11)
  await page.getByRole('link', { name: 'Finance', exact: true }).click()
  await expect(
    page.getByText('No active contracts are recorded.'),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await page.getByRole('link', { name: 'Constitution', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Choose a constitution', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await page.getByRole('link', { name: 'Scouting', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Scouting', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()
  await page.getByRole('link', { name: 'Command Center', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ashbridge', exact: true }),
  ).toBeVisible()
  await expect(page.locator('main')).not.toContainText('€')

  await page.goto('/')
  await page
    .getByRole('button', { name: 'Create new campaign', exact: true })
    .click()
  await page.getByLabel('Campaign name', { exact: true }).fill('Harbor')
  await page.getByLabel('Club name', { exact: true }).fill('Harbor Athletic')
  await page.getByLabel('Short name', { exact: true }).fill('HAR')
  await page.getByRole('button', { name: 'Save campaign', exact: true }).click()
  await page.getByRole('link', { name: 'Squad', exact: true }).click()
  await expect(page.getByText('No players at this club.')).toBeVisible()
  await page.getByRole('link', { name: 'Tactics', exact: true }).click()
  await expect(page.getByLabel('Saved lineups', { exact: true })).toHaveValue(
    '',
  )
  await expect(
    saved.getByRole('option', { name: 'League XI', exact: true }),
  ).toHaveCount(0)
  await page.goto('/app/does-not-exist/squad')
  await expect(
    page.getByRole('heading', { name: missingCampaignTitle, exact: true }),
  ).toBeVisible()
})
