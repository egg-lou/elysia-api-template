import { t } from "elysia";
import { sql, SQL, and } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { buildQuery, parseQuery, ParsedQuery } from "./query";

export const makePaginatedResponse = <S>(item: S) =>
	t.Object({
		data: t.Array(item as any),
		page: t.Number(),
		limit: t.Number(),
		total: t.Number(),
		totalPages: t.Number(),
	});

export interface PaginatedResult<T> {
	data: T[];
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export async function paginateTable<TTable extends AnyPgTable, TRow>(
	db: any,
	table: TTable,
	args: {
		parsed: ParsedQuery;
		searchable?: (keyof TTable["_"]["columns"])[];
		filterable?: (keyof TTable["_"]["columns"])[];
		sortable?: (keyof TTable["_"]["columns"])[];
		select?: SQL<unknown>;
		where?: SQL<unknown>;
		hook?(rows: TRow[]): Promise<TRow[]> | TRow[];
		defaultSort?: {
			column: keyof TTable["_"]["columns"];
			direction?: "asc" | "desc";
		};
	},
): Promise<PaginatedResult<TRow>> {
	const {
		parsed,
		searchable = [],
		filterable = [],
		sortable = [],
		select,
		where,
		hook,
		defaultSort,
	} = args;

	const built = buildQuery({
		table,
		searchable,
		filterable,
		sortable,
		query: parsed,
	});

	let finalOrderBy = built.orderBy;
	if (!finalOrderBy && defaultSort) {
		const col = (table as any)[defaultSort.column];
		if (col) {
			finalOrderBy =
				defaultSort.direction === "desc"
					? (col.desc?.() ?? col)
					: (col.asc?.() ?? col);
		}
	}

	const finalWhere =
		built.where && where ? and(built.where, where) : built.where || where;

	let countQuery = db.select({ count: sql<number>`count(*)` }).from(table);
	if (finalWhere) countQuery = countQuery.where(finalWhere as any);
	const [{ count }] = await countQuery;

	let dataQuery = db.select(select || undefined).from(table);
	if (built.where) dataQuery = dataQuery.where(built.where as any);
	if (finalOrderBy) dataQuery = dataQuery.orderBy(finalOrderBy as any);
	dataQuery = dataQuery.limit(built.limit).offset(built.offset);
	const rows = await dataQuery;

	const transformed = hook ? await hook(rows) : rows;
	const total = Number(count);
	const totalPages = Math.max(1, Math.ceil(total / built.limit));

	return {
		data: transformed,
		page: parsed.page,
		limit: parsed.limit,
		total,
		totalPages,
	};
}

export async function paginateFromRaw<TTable extends AnyPgTable, TRow>(
	db: any,
	table: TTable,
	rawQuery: Record<string, unknown>,
	cfg: Omit<Parameters<typeof paginateTable<TTable, TRow>>[2], "parsed">,
) {
	const parsed = parseQuery(rawQuery);
	return paginateTable<TTable, TRow>(db, table, { ...cfg, parsed });
}

