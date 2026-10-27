import { getContext, setContext } from 'svelte';

export type ToastTone = 'neutral' | 'green' | 'amber' | 'red';
export type Toast = {
	id: number;
	text: string;
	tone: ToastTone;
	undo?: () => void | Promise<void>;
};

const KEY = Symbol('avisos');

/** Avisos de la sesión de página. Uno por carcasa (contexto), nunca un estado de módulo compartido en SSR. */
export class Toaster {
	items = $state<Toast[]>([]);
	#seq = 0;

	show(text: string, opts: { tone?: ToastTone; undo?: Toast['undo'] } = {}) {
		const toast: Toast = { id: ++this.#seq, text, tone: opts.tone ?? 'neutral', undo: opts.undo };
		this.items = [...this.items.slice(-2), toast];
		// 5 s; 8 s si se puede deshacer (7.1, regla 5).
		setTimeout(() => this.dismiss(toast.id), opts.undo ? 8000 : 5000);
		return toast.id;
	}

	dismiss(id: number) {
		this.items = this.items.filter((t) => t.id !== id);
	}
}

export function provideToaster(): Toaster {
	return setContext(KEY, new Toaster());
}

export function useToaster(): Toaster {
	return getContext<Toaster>(KEY);
}
