import { describe, expect, it } from 'vitest';
import { cartLead, cartTotal, money, parseCart } from '$lib/domain/orders';
import { qrCodeFrom, QR_CODE_RE, newQrCode } from '$lib/server/services/qr';
import { isPublic } from '$lib/server/auth/guards';
import { can, type Actor } from '$lib/permissions';

describe('códigos QR', () => {
	it('8 caracteres sin confusos (0/O, 1/I/L) en dos grupos', () => {
		for (let i = 0; i < 200; i++) expect(newQrCode()).toMatch(QR_CODE_RE);
		expect(newQrCode()).not.toMatch(/[01ILO]/);
	});
	it('el mismo origen da el mismo código (seed estable)', () => {
		const b = new Uint8Array([0, 1, 2, 3, 30, 31, 32, 255]);
		expect(qrCodeFrom(b)).toBe(qrCodeFrom(b));
		expect(qrCodeFrom(b)).toBe('2345-Z239');
	});
	it('la landing es pública solo con un código bien formado', () => {
		expect(isPublic('/qr/7KQ4-M2XD')).toBe(true);
		expect(isPublic('/qr/7KQ4-M2X0')).toBe(false);
		expect(isPublic('/qr')).toBe(false);
		expect(isPublic('/qr/soporte/fh-tg')).toBe(false);
	});
});

describe('carrito', () => {
	it('lee las cantidades del formulario y descarta ceros', () => {
		const f = new URLSearchParams('r=FH-0147&q-g1=2&q-g3=0&q-l1=&nota=x&q-l3=1');
		expect(parseCart(f)).toEqual([
			{ itemId: 'g1', qty: 2 },
			{ itemId: 'l3', qty: 1 }
		]);
	});
	it('total en céntimos y plazo del artículo más lento', () => {
		const lines = [
			{ qty: 2, unitPriceCents: 4850, leadDays: 5 },
			{ qty: 1, unitPriceCents: 3800, leadDays: 6 }
		];
		expect(cartTotal(lines)).toBe(13500);
		expect(cartLead(lines)).toBe(6);
		expect(money(13500).replace(/\s/g, ' ')).toBe('135,00 €');
	});
});

describe('permisos de reposición', () => {
	const base = {
		id: 'x',
		status: 'active' as const,
		brands: [] as string[],
		restaurants: [] as { id: string; brandCode: string }[]
	};
	const manager: Actor = {
		...base,
		role: 'manager',
		restaurants: [{ id: 'FH-0147', brandCode: 'FH' }]
	};
	const brand: Actor = { ...base, role: 'brand', brands: ['FH'] };
	const production: Actor = { ...base, role: 'production' };
	it('el gerente pide para su restaurante; la marca, para los de su marca', () => {
		expect(can(manager, 'order.place', { restaurantId: 'FH-0147' })).toBe(true);
		expect(can(manager, 'order.place', { restaurantId: 'FH-0061' })).toBe(false);
		expect(can(brand, 'order.place', { brandCode: 'FH' })).toBe(true);
		expect(can(brand, 'order.place', { brandCode: 'VIPS' })).toBe(false);
		expect(can(production, 'order.place')).toBe(false);
	});
});
