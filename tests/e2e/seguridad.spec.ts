import { expect, test } from '@playwright/test';

test('sin sesión, las páginas llevan al acceso con la vuelta', async ({ page }) => {
	await page.goto('/campanas?marca=FH');
	await expect(page).toHaveURL('/acceso?volver=%2Fcampanas%3Fmarca%3DFH');
	await expect(page.getByRole('heading', { name: 'Acceso' })).toBeVisible();
});

test('cabeceras de seguridad y CSP con nonce', async ({ request }) => {
	const res = await request.get('/acceso');
	const h = res.headers();
	const csp = h['content-security-policy'] ?? '';
	expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/);
	expect(csp).not.toContain('unsafe-inline');
	expect(csp).toContain("frame-ancestors 'none'");
	expect(h['x-content-type-options']).toBe('nosniff');
	expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(h['permissions-policy']).toContain('camera=()');
	expect(h['cache-control']).toBe('private, no-store');
});

test('pedir un enlace no revela si el correo existe', async ({ page }) => {
	const times: number[] = [];
	for (const email of ['marta.ruiz@alsea.example', 'nadie@desconocido.example']) {
		await page.goto('/acceso');
		await page.getByLabel('Correo').fill(email);
		const start = Date.now();
		await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
		await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
		times.push(Date.now() - start);
		await expect(page.getByText('Si hay una cuenta con ese correo')).toBeVisible();
	}
	expect(Math.abs(times[0]! - times[1]!)).toBeLessThan(400);
});

test('las acciones de una sección sin permiso se rechazan en el servidor', async ({ request }) => {
	const res = await request.post('/admin/invitaciones?/crear', {
		form: { email: 'x@test.example', role: 'admin' },
		headers: { origin: 'http://localhost:4173' },
		maxRedirects: 0
	});
	expect(res.status()).toBe(401);
});
