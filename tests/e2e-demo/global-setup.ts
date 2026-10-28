import { execSync } from 'node:child_process';
import { DEMO_ENV } from '../../playwright.demo.config';

/** Seed con los ficheros en Postgres, como hace `vercel-build` en la demo. */
export default function setup() {
	execSync('npm run db:seed', { stdio: 'ignore', env: { ...process.env, ...DEMO_ENV } });
	// Al acabar, se deja el seed normal (ficheros en disco) para el resto de pruebas.
	return () => {
		execSync('npm run db:seed', {
			stdio: 'ignore',
			env: { ...process.env, STORAGE_PROVIDER: 'local' }
		});
	};
}
