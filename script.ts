import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

function generateModule(moduleName: string) {
	if (!moduleName) {
		console.error("Please provide a module name");
		console.error("Usage: bun module <module-name>");
		process.exit(1);
	}

	const modulePath = join("src", "modules", moduleName);

	// Check if module already exists
	if (existsSync(modulePath)) {
		console.error(`Module '${moduleName}' already exists`);
		process.exit(1);
	}

	// Create module directory
	mkdirSync(modulePath, { recursive: true });
	console.log(`Created module directory: ${modulePath}`);

	// Generate model.ts with soft delete
	const modelContent = `import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

export const ${moduleName} = pgTable("${moduleName}", {
    id: varchar("id")
        .$defaultFn(() => createId())
        .primaryKey(),
    // Add your fields here
    name: varchar("name", { length: 256 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"), // nullable, no default - null means not deleted
});

export type ${toPascalCase(moduleName)} = typeof ${moduleName}.$inferSelect;
export type ${toPascalCase(moduleName)}Insert = typeof ${moduleName}.$inferInsert;
`;

	// Generate service.ts with soft delete functionality
	const serviceContent = `import { db } from "../../database/client";
import { paginateTable } from "../../utils/pagination";
import { parseQuery } from "../../utils/query";
import { ${moduleName}, ${toPascalCase(moduleName)}Insert } from "./model";
import { eq, isNull, isNotNull, and } from "drizzle-orm";
import { moduleLogger } from "../../utils/logger";

const log = moduleLogger("${moduleName}.service");

export async function create${toPascalCase(moduleName)}(data: { name: string }) {
    const [row] = await db
        .insert(${moduleName})
        .values(data as ${toPascalCase(moduleName)}Insert)
        .returning();
    log.debug({ msg: "${moduleName}:created", id: row.id });
    return row;
}

export async function list${toPascalCase(moduleName)}(rawQuery: Record<string, unknown>) {
    const parsed = parseQuery(rawQuery);
    log.info({ msg: "${moduleName}:list", query: parsed });
    
    // Only show non-deleted records
    return paginateTable<typeof ${moduleName}, any>(db, ${moduleName}, {
        parsed,
        searchable: ["name"],
        sortable: ["name", "createdAt", "updatedAt"],
        filterable: ["name", "createdAt", "updatedAt"],
    });
}

// Modified to only get non-deleted records
export async function get${toPascalCase(moduleName)}(id: string) {
    log.info({ msg: "${moduleName}:get", id });
    const rows = await db
        .select()
        .from(${moduleName})
        .where(and(eq(${moduleName}.id, id), isNull(${moduleName}.deletedAt))); // Only non-deleted
    return rows[0] ?? null;
}

// Get including soft-deleted records (admin function)
export async function get${toPascalCase(moduleName)}IncludeDeleted(id: string) {
    log.info({ msg: "${moduleName}:get-include-deleted", id });
    const rows = await db.select().from(${moduleName}).where(eq(${moduleName}.id, id));
    return rows[0] ?? null;
}

export async function update${toPascalCase(moduleName)}(
    id: string,
    data: { name?: string },
) {
    log.info({ msg: "${moduleName}:update", id, data });
    const [row] = await db
        .update(${moduleName})
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(${moduleName}.id, id), isNull(${moduleName}.deletedAt))) // Only update non-deleted records
        .returning();
    return row;
}

// Soft delete - sets deletedAt timestamp
export async function delete${toPascalCase(moduleName)}(id: string) {
    log.info({ msg: "${moduleName}:soft-delete", id });
    const [row] = await db
        .update(${moduleName})
        .set({ deletedAt: new Date() })
        .where(and(eq(${moduleName}.id, id), isNull(${moduleName}.deletedAt))) // Only delete non-deleted records
        .returning();
    return row;
}

// Restore a soft-deleted record
export async function restore${toPascalCase(moduleName)}(id: string) {
    log.info({ msg: "${moduleName}:restore", id });
    const [row] = await db
        .update(${moduleName})
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(${moduleName}.id, id), isNotNull(${moduleName}.deletedAt))) // Only restore deleted records
        .returning();
    return row;
}

// Hard delete - permanently removes the record
export async function hardDelete${toPascalCase(moduleName)}(id: string) {
    log.info({ msg: "${moduleName}:hard-delete", id });
    const [row] = await db.delete(${moduleName}).where(eq(${moduleName}.id, id)).returning();
    return row;
}

// List only soft-deleted records
export async function listDeleted${toPascalCase(moduleName)}(rawQuery: Record<string, unknown>) {
    const parsed = parseQuery(rawQuery);
    log.info({ msg: "${moduleName}:list-deleted", query: parsed });
    
    return paginateTable<typeof ${moduleName}, any>(db, ${moduleName}, {
        parsed,
        searchable: ["name"],
        sortable: ["name", "createdAt", "updatedAt", "deletedAt"],
        filterable: ["name", "createdAt", "updatedAt", "deletedAt"],
    });
}
`;

	// Generate validation.ts with deletedAt field
	const validationContent = `import { t } from "elysia";
import { spread } from "../../utils/spread";
import { ${moduleName} } from "./model";
import { makePaginatedResponse } from "../../utils/pagination";

const insert${toPascalCase(moduleName)} = spread(${moduleName}, "insert");
const select${toPascalCase(moduleName)} = spread(${moduleName}, "select");

export const ${toCamelCase(moduleName)}CreateBody = t.Object({
    name: t.String({ ...insert${toPascalCase(moduleName)}.name, minLength: 2, maxLength: 256 }),
});

export const ${toCamelCase(moduleName)}UpdateBody = t.Partial(${toCamelCase(moduleName)}CreateBody);

export const ${toCamelCase(moduleName)}Response = t.Object({
    id: select${toPascalCase(moduleName)}.id,
    name: select${toPascalCase(moduleName)}.name,
    createdAt: select${toPascalCase(moduleName)}.createdAt,
    updatedAt: select${toPascalCase(moduleName)}.updatedAt,
    deletedAt: t.Optional(select${toPascalCase(moduleName)}.deletedAt), // Include deletedAt in response
});

export const ${toCamelCase(moduleName)}ListResponse = t.Array(${toCamelCase(moduleName)}Response);

export type ${toPascalCase(moduleName)}CreateBody = typeof ${toCamelCase(moduleName)}CreateBody.static;
export type ${toPascalCase(moduleName)}UpdateBody = typeof ${toCamelCase(moduleName)}UpdateBody.static;
export type ${toPascalCase(moduleName)}Response = typeof ${toCamelCase(moduleName)}Response.static;
export type ${toPascalCase(moduleName)}ListResponse = typeof ${toCamelCase(moduleName)}ListResponse.static;

export const paginated${toPascalCase(moduleName)}Response = makePaginatedResponse(${toCamelCase(moduleName)}Response);
export const notFoundResponse = t.Object({ message: t.String() });
export const deleteResponse = t.Object({ deleted: t.String() });
export const restoreResponse = t.Object({ restored: t.String() });
`;

	// Generate index.ts with soft delete endpoints
	const indexContent = `import Elysia, { t } from "elysia";
import { ${toCamelCase(moduleName)}CreateBody, ${toCamelCase(moduleName)}UpdateBody, ${toCamelCase(moduleName)}Response, 
    paginated${toPascalCase(moduleName)}Response, notFoundResponse, deleteResponse, restoreResponse,
} from "./validation";
import {
    create${toPascalCase(moduleName)},
    list${toPascalCase(moduleName)},
    get${toPascalCase(moduleName)},
    update${toPascalCase(moduleName)},
    delete${toPascalCase(moduleName)},
    restore${toPascalCase(moduleName)},
    hardDelete${toPascalCase(moduleName)},
    listDeleted${toPascalCase(moduleName)},
} from "./service";


export const ${toCamelCase(moduleName)}Routes = new Elysia({ prefix: "/${moduleName}" })
    // List active (non-deleted) records
    .get(
        "/",
        async ({ query }) => {
            return await list${toPascalCase(moduleName)}(query);
        },
        {
            response: paginated${toPascalCase(moduleName)}Response,
        },
    )
    // List soft-deleted records
    .get(
        "/deleted",
        async ({ query }) => {
            return await listDeleted${toPascalCase(moduleName)}(query);
        },
        {
            response: paginated${toPascalCase(moduleName)}Response,
        },
    )
    // Get single active record
    .get(
        "/:id",
        async ({ params, set }) => {
            const ${toCamelCase(moduleName)} = await get${toPascalCase(moduleName)}(params.id);
            if (!${toCamelCase(moduleName)}) {
                set.status = 404;
                return { message: "${toPascalCase(moduleName)} not found" } as const;
            }
            return ${toCamelCase(moduleName)};
        },
        { response: { 200: ${toCamelCase(moduleName)}Response, 404: notFoundResponse } },
    )
    // Create new record
    .post("/", async ({ body }) => create${toPascalCase(moduleName)}(body), {
        body: ${toCamelCase(moduleName)}CreateBody,
        response: ${toCamelCase(moduleName)}Response,
    })
    // Update record
    .patch(
        "/:id",
        async ({ params, body, set }) => {
            const ${toCamelCase(moduleName)} = await update${toPascalCase(moduleName)}(params.id, body);
            if (!${toCamelCase(moduleName)}) {
                set.status = 404;
                return { message: "${toPascalCase(moduleName)} not found" } as const;
            }
            return ${toCamelCase(moduleName)};
        },
        {
            body: ${toCamelCase(moduleName)}UpdateBody,
            response: { 200: ${toCamelCase(moduleName)}Response, 404: notFoundResponse },
        },
    )
    // Soft delete
    .delete(
        "/:id",
        async ({ params, set }) => {
            const deleted = await delete${toPascalCase(moduleName)}(params.id);
            if (!deleted) {
                set.status = 404;
                return { message: "${toPascalCase(moduleName)} not found" } as const;
            }
            return { deleted: deleted.id } as const;
        },
        { response: { 200: deleteResponse, 404: notFoundResponse } },
    )
    // Restore soft-deleted record
    .patch(
        "/:id/restore",
        async ({ params, set }) => {
            const restored = await restore${toPascalCase(moduleName)}(params.id);
            if (!restored) {
                set.status = 404;
                return { message: "Deleted ${toCamelCase(moduleName)} not found" } as const;
            }
            return { restored: restored.id } as const;
        },
        { response: { 200: restoreResponse, 404: notFoundResponse } },
    )
    // Hard delete (permanent)
    .delete(
        "/:id/hard",
        async ({ params, set }) => {
            const deleted = await hardDelete${toPascalCase(moduleName)}(params.id);
            if (!deleted) {
                set.status = 404;
                return { message: "${toPascalCase(moduleName)} not found" } as const;
            }
            return { deleted: deleted.id } as const;
        },
        { response: { 200: deleteResponse, 404: notFoundResponse } },
    );
`;

	// Write files
	writeFileSync(join(modulePath, "model.ts"), modelContent);
	writeFileSync(join(modulePath, "service.ts"), serviceContent);
	writeFileSync(join(modulePath, "validation.ts"), validationContent);
	writeFileSync(join(modulePath, "index.ts"), indexContent);

	// Update server.ts to include the new routes
	updateServerFile(moduleName);

	console.log(
		`✅ Generated module '${moduleName}' with soft delete functionality!`,
	);
	console.log("\nFiles created:");
	console.log(`  - ${join(modulePath, "model.ts")}`);
	console.log(`  - ${join(modulePath, "service.ts")}`);
	console.log(`  - ${join(modulePath, "validation.ts")}`);
	console.log(`  - ${join(modulePath, "index.ts")}`);
	console.log(`  - Updated server.ts with new routes`);
	console.log("\nSoft Delete Features:");
	console.log(`  - GET /api/${moduleName} - List active records`);
	console.log(`  - GET /api/${moduleName}/deleted - List soft-deleted records`);
	console.log(
		`  - DELETE /api/${moduleName}/:id - Soft delete (sets deletedAt)`,
	);
	console.log(
		`  - PATCH /api/${moduleName}/:id/restore - Restore soft-deleted record`,
	);
	console.log(`  - DELETE /api/${moduleName}/:id/hard - Permanent delete`);
	console.log("\nNext steps:");
	console.log(`1. Edit the model.ts file to add your specific fields`);
	console.log(`2. Update validation.ts with proper validation rules`);
	console.log(
		`3. Run 'bun db:generate' and 'bun db:migrate' to apply database changes`,
	);
	console.log(`4. Your routes are now available at: /api/${moduleName}`);
}

function updateServerFile(moduleName: string) {
	const serverFilePath = join("src", "server.ts");

	if (!existsSync(serverFilePath)) {
		console.warn("server.ts file not found, skipping auto-update");
		return;
	}

	let serverContent = readFileSync(serverFilePath, "utf-8");

	// Add import statement
	const importStatement = `import { ${toCamelCase(moduleName)}Routes } from "./modules/${moduleName}";`;

	// Find the last import statement and add after it
	const importRegex = /import\s+.*from\s+["']\.\/modules\/.*["'];/g;
	const imports = serverContent.match(importRegex);

	if (imports && imports.length > 0) {
		// Add after the last module import
		const lastImport = imports[imports.length - 1];
		const lastImportIndex = serverContent.lastIndexOf(lastImport);
		const insertIndex = lastImportIndex + lastImport.length;

		serverContent =
			serverContent.slice(0, insertIndex) +
			`\n${importStatement}` +
			serverContent.slice(insertIndex);
	} else {
		// Add after the noteRoutes import as fallback
		const noteRoutesImport = 'import { noteRoutes } from "./modules/notes";';
		serverContent = serverContent.replace(
			noteRoutesImport,
			`${noteRoutesImport}\n${importStatement}`,
		);
	}

	// Add route usage
	const routeUsage = `.use(${toCamelCase(moduleName)}Routes)`;

	// Find the existing .use() chain and add the new route
	const useChainRegex =
		/\.use\(new Elysia\(\{ prefix: "\/api" \}\)\.use\([^)]+\)\)/;
	const match = serverContent.match(useChainRegex);

	if (match) {
		const existingChain = match[0];
		const newChain = existingChain.replace(/\)$/, `${routeUsage})`);
		serverContent = serverContent.replace(existingChain, newChain);
	} else {
		// Fallback: add after noteRoutes
		serverContent = serverContent.replace(
			".use(noteRoutes)",
			`.use(noteRoutes)${routeUsage}`,
		);
	}

	writeFileSync(serverFilePath, serverContent);
	console.log(`Updated ${serverFilePath} with new routes`);
}

function toPascalCase(str: string): string {
	return str.replace(/(^\w|_\w)/g, (match) =>
		match.replace("_", "").toUpperCase(),
	);
}

function toCamelCase(str: string): string {
	const pascal = toPascalCase(str);
	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// Get module name from command line arguments
const moduleName = process.argv[2];
generateModule(moduleName);
