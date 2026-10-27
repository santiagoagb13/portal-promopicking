import { z } from './z';

export const emailInput = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email({ message: 'Escribe un correo válido' }));

export const themeInput = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof themeInput>;
