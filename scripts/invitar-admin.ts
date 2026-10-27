/**
 * Crea la invitación del primer administrador en un entorno sin ninguno (p. ej. producción recién
 * creada). Uso: npm run invitar-admin -- correo@dominio.com "Nombre Apellido" [--sin-correo]
 * Con --sin-correo no se envía el correo y el enlace solo se muestra aquí.
 */
import { emailInput } from '$lib/schemas/auth';
import { closeDb } from '$lib/server/db';
import { bootstrapAdminInvitation } from '$lib/server/services/invitations';

const [email = '', name = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const parsed = emailInput.safeParse(email);
if (!parsed.success) {
	console.error(
		'Uso: npm run invitar-admin -- correo@dominio.com "Nombre Apellido" [--sin-correo]'
	);
	process.exit(1);
}
try {
	const { url } = await bootstrapAdminInvitation(parsed.data, name, {
		sendMail: !process.argv.includes('--sin-correo')
	});
	console.info(`Invitación de administración para ${parsed.data}:\n  ${url}`);
} catch (e) {
	console.error((e as Error).message);
	process.exitCode = 1;
} finally {
	await closeDb();
}
