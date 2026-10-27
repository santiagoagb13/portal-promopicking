import type { SubmitFunction } from '@sveltejs/kit';

/**
 * `use:enhance` para formularios dentro de un panel o diálogo: si la acción va bien, cierra;
 * si falla, deja el panel abierto con los errores que devuelve la acción.
 */
export function closeOnSuccess(close: () => void, onSuccess?: () => void): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			if (result.type === 'success' || result.type === 'redirect') {
				close();
				onSuccess?.();
			}
			await update({ reset: false });
		};
}
