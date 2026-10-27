/** Usuarios de prueba con sesión guardada (la crea auth.setup.ts antes de las demás pruebas). */
export const USERS = {
	jorge: 'jorge.martin@promopicking.example',
	marta: 'marta.ruiz@alsea.example',
	carlos: 'carlos.vega@alsea.example'
} as const;

export const stateOf = (user: keyof typeof USERS) => `tests/e2e/.auth/${user}.json`;
