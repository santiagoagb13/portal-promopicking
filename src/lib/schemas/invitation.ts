import { z } from './z';
import { ROLES } from '$lib/permissions';

const list = z
	.union([z.string(), z.array(z.string())])
	.optional()
	.transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean));

export const invitationInput = z.object({
	email: z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email({ message: 'Correo no válido' })),
	name: z.string().trim().max(120).optional().default(''),
	role: z.enum(ROLES, { message: 'Elige un rol' }),
	brands: list,
	restaurants: list
});
export type InvitationInput = z.infer<typeof invitationInput>;

export const acceptName = z.string().trim().min(2, 'Escribe tu nombre').max(120);
