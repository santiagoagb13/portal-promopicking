/**
 * Modo pruebas (ADR 0013): entrar sin login como uno de los perfiles de ejemplo del seed.
 * El punto de entrada es solo de servidor (`createAuthEndpoint.serverOnly`): no existe como URL y
 * solo lo llaman los hooks y el cambio de perfil, y solo con `PORTAL_DEMO=1`.
 */
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import * as z from 'zod';
import { config } from '../config';

/** Los cinco perfiles del prototipo, en el orden del selector «Ver como». */
export const DEMO_PROFILES = [
	{ id: 'u-jorge-martin', name: 'Jorge Martín', label: 'Promopicking · administración' },
	{ id: 'u-marta-ruiz', name: 'Marta Ruiz', label: "Marketing Foster's Hollywood" },
	{ id: 'u-carlos-vega', name: 'Carlos Vega', label: 'Marketing VIPS' },
	{ id: 'u-laura-pons', name: 'Laura Pons', label: 'Marketing Ginos' },
	{ id: 'u-ana-soler', name: 'Ana Soler', label: 'Gerente · FH Plenilunio' }
] as const;
export const DEMO_DEFAULT = DEMO_PROFILES[0].id;

export const isDemoProfile = (id: string) => DEMO_PROFILES.some((p) => p.id === id);

export function modoPruebas() {
	return {
		id: 'modo-pruebas',
		endpoints: {
			entrarModoPruebas: createAuthEndpoint.serverOnly(
				{ method: 'POST', body: z.object({ userId: z.string() }) },
				async (ctx) => {
					if (!config.demo || !isDemoProfile(ctx.body.userId))
						throw new APIError('NOT_FOUND', { message: 'No disponible' });
					const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
					if (!user) throw new APIError('NOT_FOUND', { message: 'Perfil no encontrado' });
					const session = await ctx.context.internalAdapter.createSession(user.id);
					if (!session) throw new APIError('FORBIDDEN', { message: 'Cuenta no activa' });
					await setSessionCookie(ctx, { session, user });
					return ctx.json({ session, user });
				}
			)
		}
	} satisfies BetterAuthPlugin;
}
