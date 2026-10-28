/**
 * Cola sin conexión de escaneos, recepciones e incidencias (9.1). Vive en IndexedDB, la comparten
 * la página y el service worker, y conserva la hora original de cada evento. Cada evento lleva un
 * id de cliente: si se reenvía, el servidor no lo duplica.
 */
export type QueuedEvent = {
	clientId: string;
	type: 'scan' | 'receive' | 'incident';
	/** Hora del dispositivo (ISO). */
	at: string;
	payload: Record<string, unknown>;
	photo?: Blob | null;
	label: string;
	error?: string | null;
};

export const SYNC_TAG = 'cola-kits';
export const CHANNEL = 'cola-kits';
const DB = 'portal-cola';
const STORE = 'eventos';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientId' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(
	mode: IDBTransactionMode,
	fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const req = fn(db.transaction(STORE, mode).objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export const enqueue = (e: QueuedEvent) => tx('readwrite', (s) => s.put(e));
export const pending = () =>
	tx<QueuedEvent[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedEvent[]>);
const remove = (id: string) => tx('readwrite', (s) => s.delete(id));

export type SendResult =
	{ ok: true; data: Record<string, unknown> } | { ok: false; offline: boolean; error: string };

/** Envía un evento al servidor. `offline` distingue «no hay red» de «el servidor lo rechaza». */
export async function send(e: QueuedEvent, fetcher: typeof fetch = fetch): Promise<SendResult> {
	const body = new FormData();
	body.set(
		'evento',
		JSON.stringify({ clientId: e.clientId, type: e.type, at: e.at, ...e.payload })
	);
	if (e.photo) body.set('foto', e.photo, 'foto.jpg');
	let res: Response;
	try {
		res = await fetcher('/api/kits/eventos', { method: 'POST', body, credentials: 'same-origin' });
	} catch {
		return { ok: false, offline: true, error: 'Sin conexión' };
	}
	const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (res.ok) return { ok: true, data };
	if (res.status === 401)
		return {
			ok: false,
			offline: true,
			error: 'Sesión caducada: vuelve a entrar para enviar la cola'
		};
	return { ok: false, offline: false, error: String(data.error ?? `Error ${res.status}`) };
}

/**
 * Reenvía la cola en orden. Se para al primer fallo de red; los rechazos del servidor quedan en la
 * cola con su motivo para que la persona los vea.
 */
export async function flush(
	fetcher: typeof fetch = fetch
): Promise<{ sent: number; left: number }> {
	const items = (await pending()).sort((a, b) => a.at.localeCompare(b.at));
	let sent = 0;
	for (const item of items) {
		if (item.error) continue;
		const r = await send(item, fetcher);
		if (r.ok) {
			await remove(item.clientId);
			sent++;
		} else if (r.offline) break;
		else await enqueue({ ...item, error: r.error });
	}
	const left = (await pending()).length;
	try {
		new BroadcastChannel(CHANNEL).postMessage({ sent, left });
	} catch {
		/* sin BroadcastChannel */
	}
	return { sent, left };
}

export const discard = remove;

/** Pide al service worker que reenvíe la cola cuando vuelva la red (Background Sync, si existe). */
export async function requestSync() {
	try {
		// `ready` no se resuelve si el service worker aún no está activo (p. ej. sin red al instalarlo).
		const reg = await Promise.race([
			navigator.serviceWorker?.ready,
			new Promise<undefined>((r) => setTimeout(r, 1000))
		]);
		await (reg as unknown as { sync?: { register(tag: string): Promise<void> } })?.sync?.register(
			SYNC_TAG
		);
	} catch {
		/* Safari no tiene Background Sync: se reenvía al volver a la página o al recuperar la red */
	}
}

export { shrinkPhoto } from '$lib/photo';
