// Sustituto de `$env/dynamic/private` para los scripts que se ejecutan con tsx fuera de SvelteKit.
export const env = process.env as Record<string, string | undefined>;
