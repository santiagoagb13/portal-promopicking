/** Reposiciones (8.8): estados, tonos y cuentas del carrito, compartidos por servidor y cliente. */
import type { ChipTone } from './campaign';

export const ORDER_STATE_LABEL = {
	pending_validation: 'Pendiente de validar',
	preparing: 'En preparación',
	shipping: 'En reparto',
	delivered: 'Entregado',
	cancelled: 'Cancelado'
} as const;
export type OrderState = keyof typeof ORDER_STATE_LABEL;
export const ORDER_STATES = Object.keys(ORDER_STATE_LABEL) as OrderState[];

export const ORDER_TONE: Record<OrderState, ChipTone> = {
	pending_validation: 'amber',
	preparing: 'primary',
	shipping: 'info',
	delivered: 'green',
	cancelled: ''
};

export const CATEGORY_LABEL = { generic: 'Genérico', lsm: 'LSM' } as const;

/** Siguiente paso de Operaciones y el texto de su botón. */
export const ADVANCE_LABEL: Partial<Record<OrderState, string>> = {
	preparing: 'Marcar en reparto',
	shipping: 'Marcar entregado'
};

export const MAX_LINE_QTY = 999;

export function money(cents: number): string {
	return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type Priced = { qty: number; unitPriceCents: number; leadDays?: number };
export function cartTotal(lines: Priced[]): number {
	return lines.reduce((n, l) => n + l.qty * l.unitPriceCents, 0);
}
/** El pedido llega cuando llega su artículo más lento. */
export function cartLead(lines: Priced[]): number {
	return lines.reduce((n, l) => Math.max(n, l.leadDays ?? 0), 0);
}

/** Lee las cantidades del formulario del catálogo (`q-<artículo>`), sin ceros. */
export function parseCart(form: FormData | URLSearchParams): { itemId: string; qty: number }[] {
	const out: { itemId: string; qty: number }[] = [];
	for (const [k, v] of form.entries()) {
		if (!k.startsWith('q-') || typeof v !== 'string') continue;
		const qty = Number(v || 0);
		if (qty > 0) out.push({ itemId: k.slice(2), qty });
	}
	return out;
}
