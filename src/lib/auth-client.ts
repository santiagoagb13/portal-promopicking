import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';

/** Cliente de Better Auth: solo para las ceremonias WebAuthn (registrar y usar passkeys). */
export const authClient = createAuthClient({ basePath: '/api/auth', plugins: [passkeyClient()] });

export { passkeyError, passkeysSupported } from './passkey-errors';
