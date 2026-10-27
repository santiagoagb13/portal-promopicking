/** Textos compartidos de la interfaz (español). Preparado para añadir ca/en en el futuro. */
import type { Role } from '$lib/permissions';

export const ROLE_LABEL: Record<Role, string> = {
	admin: 'Administración',
	ops: 'Operaciones',
	production: 'Producción',
	brand: 'Marketing de marca',
	manager: 'Gerente'
};

export const ROLE_ORG: Record<Role, string> = {
	admin: 'Promopicking',
	ops: 'Promopicking',
	production: 'Albatros',
	brand: 'Alsea',
	manager: 'Restaurante'
};

export const THEME_LABEL = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' } as const;
