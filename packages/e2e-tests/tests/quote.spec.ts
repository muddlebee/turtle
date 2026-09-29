import { expect, type Page, test } from '@playwright/test'

async function selectUsdcToHdx(page: Page) {
  await page.goto('/')

  await page.getByTestId('chain-select-trigger-from').getByText('Chain').click()
  await page
    .getByRole('listitem')
    .filter({ hasText: /^Asset Hub$/ })
    .click()
  await page
    .getByRole('listitem')
    .filter({ hasText: /^USDC$/ })
    .last()
    .click()

  await page.getByTestId('chain-select-trigger-to').getByText('Chain').click()
  await page
    .getByRole('listitem')
    .filter({ hasText: /^Hydration$/ })
    .click()
  await page.getByRole('listitem').filter({ hasText: /^HDX$/ }).click()
}

test('selecting a destination chain does not update Transfer during Controller render', async ({ page }) => {
  const renderWarnings: string[] = []
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('Cannot update a component')) {
      renderWarnings.push(message.text())
    }
  })

  await selectUsdcToHdx(page)

  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible()
  expect(renderWarnings).toEqual([])
})

test('quotes Asset Hub USDC to Hydration HDX without a connected wallet', async ({ page }) => {
  test.setTimeout(90_000)

  await selectUsdcToHdx(page)
  await page.getByTestId('amount-input').first().fill('11')

  await expect(page.getByTestId('amount-input').nth(1)).toHaveValue(/^[1-9]\d*(\.\d+)?$/, {
    timeout: 60_000,
  })
  expect(await page.getByTestId('amount-input').nth(1).inputValue()).toMatch(/^\d+(?:\.\d{1,3})?$/)
})

test('keeps selected chains and tokens in the URL and restores them on reload', async ({ page }) => {
  await selectUsdcToHdx(page)
  await page.getByTestId('amount-input').first().fill('11')

  await expect
    .poll(() => new URL(page.url()).searchParams.toString())
    .toBe('fromChain=polkadot-assethub&fromToken=usdc&toChain=hydration&toToken=hdx')

  await page.reload()

  await expect(page.getByTestId('chain-select-trigger-from')).toContainText('Asset Hub')
  await expect(page.getByTestId('chain-select-trigger-to')).toContainText('Hydration')
  await expect(page.getByTestId('token-select-symbol')).toHaveText(['USDC', 'HDX'])
  await expect(page.getByTestId('amount-input').first()).toHaveValue('')
})

test('ignores invalid URL selections without removing unrelated parameters', async ({ page }) => {
  await page.goto('/?campaign=test&fromChain=polkadot-assethub&fromToken=unknown&toChain=hydration&toToken=hdx')

  await expect(page.getByTestId('chain-select-trigger-from')).toContainText('Asset Hub')
  await expect.poll(() => new URL(page.url()).searchParams.toString()).toBe('campaign=test&fromChain=polkadot-assethub')
  await expect(page.getByTestId('token-select-symbol')).toHaveCount(0)
})
