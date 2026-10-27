import { error } from '@sveltejs/kit';
import { fmtDateTime } from '$lib/domain/dates';
import { audit } from '$lib/server/audit';
import { approvalCertificate } from '$lib/server/pdf';
import { certificateData, STATUS_LABEL } from '$lib/server/services/approvals';
import type { RequestHandler } from './$types';

/** Acta de aprobación de un soporte en PDF (8.5): versiones, decisión, quién, cuándo, dispositivo y huella. */
export const GET: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
	const actor = locals.user!;
	const data = await certificateData(actor, params.soporte);
	if (!data) error(404, 'Soporte no encontrado');
	const pdf = await approvalCertificate({
		support: data.support.name,
		campaign: `${data.support.campaignName} (${data.support.campaignId})`,
		brand: data.support.brandShort,
		artworkLabel: data.support.artworkLabel,
		generatedAt: fmtDateTime(new Date()),
		generatedBy: actor.name,
		rows: data.versions.map((v) => ({
			code: v.code,
			revision: v.revision,
			status: STATUS_LABEL[v.status],
			kits: v.kitsCount,
			decidedBy: v.decidedBy,
			decidedAt: v.decidedAt ? fmtDateTime(v.decidedAt) : null,
			device: v.device,
			hash: v.hash
		}))
	});
	await audit({
		userId: actor.id,
		action: 'artwork.certificate',
		entity: 'support',
		entityId: params.soporte,
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent')
	});
	return new Response(new Uint8Array(pdf), {
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="acta-${params.soporte}.pdf"`,
			'cache-control': 'private, no-store'
		}
	});
};
