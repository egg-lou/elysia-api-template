import { defineConfig } from "drizzle-kit";
import { environment } from "./src/environment";

export default defineConfig({
	out: "./drizzle",
	dialect: "postgresql",
	schema: "./src/modules/**/model.ts",
	dbCredentials: {
		url: environment.DATABASE_URL,
	},
	strict: true,
	verbose: true,
});
