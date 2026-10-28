import { PERIODS, type Period } from '$lib/domain/reports';

/** Marca y periodo desde la URL (los comparten la página, los CSV y el PDF). */
export function reportParams(url: URL): { brand: string | null; period: Period } {
	const p = url.searchParams.get('periodo');
	return {
		brand: url.searchParams.get('marca') || null,
		period: PERIODS.find((x) => x === p) ?? '12m'
	};
}
