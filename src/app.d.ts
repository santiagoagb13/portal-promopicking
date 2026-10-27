import type { SessionUser } from '$lib/server/auth/actor';
import type { Theme } from '$lib/schemas/auth';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			session: { id: string; createdAt: Date; updatedAt: Date; expiresAt: Date } | null;
			theme: Theme;
		}
		interface PageData {
			title?: string;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
