import { expect, request, test, type Browser, type Page } from '@playwright/test';

let n = 0;
/** Sign up a player and grow a monster, all through the API. Returns the username. */
async function makePlayer(baseURL: string, label: string) {
  const ctx = await request.newContext({ baseURL });
  const username = `e2e${label}${Date.now() % 1e8}${n++}`;
  expect((await ctx.post('/api/auth/signup', { data: { username, password: 'kidpass1' } })).ok()).toBeTruthy();
  const look = { parts: { species: 'beast', eyes: 'angry', mouth: 'fangs', head: 'spikes', arms: 'claws', legs: 'feet', pattern: 'spots' }, palette: { body: label === 'a' ? 0 : 6, accent: 2 } };
  const grow = await ctx.post('/api/monsters/grow', { data: { name: label === 'a' ? 'Chomper' : 'Squasher', tier: 'standard', ...look, skills: { attack: 3, defense: 3, tricks: 3, brains: 3 } } });
  expect(grow.ok()).toBeTruthy();
  await ctx.dispose();
  return username;
}

async function logIn(browser: Browser, username: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('kidpass1');
  await page.getByTestId('login').click();
  await page.waitForURL('**/map');
  return page;
}

test('two players fight a full PvP fight in two browsers', async ({ browser, baseURL }) => {
  const a = await makePlayer(baseURL!, 'a');
  const b = await makePlayer(baseURL!, 'b');
  const pageA = await logIn(browser, a);
  const pageB = await logIn(browser, b);

  // A finds B online and challenges them to a Bite fight with 2 skill rounds.
  await pageA.goto('/fight');
  await pageA.getByRole('button', { name: /Players/ }).click();
  await pageA.getByTestId(`opponent-${b}`).click({ timeout: 30_000 });
  await pageA.getByTestId('stake-bite').click();
  await pageA.getByTestId('rounds-2').click();
  await pageA.getByTestId('send-challenge').click();

  // B sees the challenge pop up anywhere in the game and accepts.
  await pageB.getByTestId('accept-challenge').click({ timeout: 30_000 });

  // Both land on the fight screen and pick secretly each round.
  for (const page of [pageA, pageB]) await page.waitForURL('**/fight/*');
  await expect(pageA.getByTestId('wheel')).toBeVisible();
  for (let round = 0; round < 2; round++) {
    await pageA.getByTestId('pick-attack').click({ timeout: 20_000 });
    await pageB.getByTestId('pick-brains').click({ timeout: 20_000 });
  }

  // The wheel spins, the winner's finishing move plays, then each side sees the result.
  await expect(pageA.getByTestId('finisher')).toBeAttached({ timeout: 30_000 });
  const outcome = async (page: Page) => (await page.getByRole('heading', { name: /VICTORY!|DEFEAT/ }).textContent({ timeout: 30_000 }))!.trim();
  const [ra, rb] = await Promise.all([outcome(pageA), outcome(pageB)]);
  expect([ra, rb].sort()).toEqual(['DEFEAT', 'VICTORY!']);

  // The fight shows up in both players' history.
  await pageA.goto('/history');
  await expect(pageA.getByText(/Chomper vs Squasher/)).toBeVisible();
});
