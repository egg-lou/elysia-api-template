import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { environment } from "../environment";
import { logger } from "../utils/logger";

const client = postgres(environment.DATABASE_URL, {
	max: 5,
	prepare: true,
	debug: (conn, query, params) => {
		logger.debug({
			msg: "db:query",
			query,
			params,
		});
	},
});

export const db = drizzle(client);

export async function closeDb() {
	await client.end();
}
