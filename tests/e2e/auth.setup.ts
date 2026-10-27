import { test as setup } from '@playwright/test';
import { signInWithMagicLink } from './helpers';
import { stateOf, USERS } from './users';

for (const [user, email] of Object.entries(USERS) as [keyof typeof USERS, string][]) {
	setup(`sesión de ${user}`, async ({ page }) => {
		await signInWithMagicLink(page, email);
		await page.context().storageState({ path: stateOf(user) });
	});
}
