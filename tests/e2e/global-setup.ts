import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { E2E_ENV } from '../../playwright.config';

/** BD lista y con los datos del prototipo; bandeja de correo vacía. */
export default function globalSetup() {
	rmSync('test-results/mail', { recursive: true, force: true });
	const env = { ...process.env, ...E2E_ENV };
	execSync('npm run db:migrate', { stdio: 'inherit', env });
	execSync('npm run db:seed', { stdio: 'inherit', env });
}
