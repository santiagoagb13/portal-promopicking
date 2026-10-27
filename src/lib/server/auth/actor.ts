import { eq } from 'drizzle-orm';
import type { Actor } from '$lib/permissions';
import { currentDb, tables } from '../db';

const { users, userBrands, userRestaurants, restaurants } = tables;

export type SessionUser = Actor & { email: string; name: string; organization: string | null };

/** Carga el usuario con su ámbito (marcas y restaurantes) para `can()`. */
export async function loadActor(userId: string): Promise<SessionUser | null> {
	const db = currentDb();
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) return null;
	const [brandRows, restaurantRows] = await Promise.all([
		db.select({ code: userBrands.brandCode }).from(userBrands).where(eq(userBrands.userId, userId)),
		db
			.select({ id: restaurants.id, brandCode: restaurants.brandCode, name: restaurants.name })
			.from(userRestaurants)
			.innerJoin(restaurants, eq(restaurants.id, userRestaurants.restaurantId))
			.where(eq(userRestaurants.userId, userId))
	]);
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		role: user.role,
		status: user.status,
		organization: user.organization,
		brands: brandRows.map((b) => b.code),
		restaurants: restaurantRows.map((r) => ({ id: r.id, brandCode: r.brandCode }))
	};
}
