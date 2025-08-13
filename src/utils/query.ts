import { and, or, ilike, eq, gt, gte, lt, lte, SQL } from "drizzle-orm";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";
import { t } from "elysia";

const RESERVED = new Set(["page", "limit", "search", "sort", "order"]);

export interface ParsedQuery {
	page: number;
	limit: number;
	search?: string;
	sort?: string;
	order: "asc" | "desc";
	filters: Record<string, string | string[]>;
}

export interface BuildQueryOptions<T extends AnyPgTable> {
	table: T;
	searchable?: (keyof T["_"]["columns"])[];
	filterable?: (keyof T["_"]["columns"])[];
	sortable?: (keyof T["_"]["columns"])[];
	query: ParsedQuery;
	strictFilters?: boolean;
}

export interface BuiltQuery {
	where?: SQL;
	orderBy?: SQL;
	offset: number;
	limit: number;
}

export const baseQuerySchema = t.Object({
	page: t.Optional(t.Numeric({ minimum: 1 })),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
	search: t.Optional(t.String()),
	sort: t.Optional(t.String()),
	order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
});

export function parseQuery(
	raw: Record<string, unknown>,
	defaults: Partial<ParsedQuery> = {},
): ParsedQuery {
	const page = posInt(raw.page, defaults.page ?? 1);
	const limit = clamp(posInt(raw.limit, defaults.limit ?? 20), 1, 100);
	const search = str(raw.search);
	const sort = str(raw.sort);
	const order: "asc" | "desc" =
		raw.order === "desc"
			? "desc"
			: raw.order === "asc"
				? "asc"
				: (defaults.order ?? "asc");

	const filters: Record<string, string | string[]> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (RESERVED.has(k) || v == null) continue;
		filters[k] = Array.isArray(v) ? v.map(String) : String(v);
	}

	return {
		page,
		limit,
		search: search || undefined,
		sort: sort || undefined,
		order,
		filters,
	};
}

export function buildQuery<T extends AnyPgTable>(
	o: BuildQueryOptions<T>,
): BuiltQuery {
	const {
		table,
		searchable = [],
		filterable = [],
		sortable = [],
		query,
		strictFilters = true,
	} = o;
	const columns = table as unknown as Record<string, PgColumn<any>>;
	const whereParts: SQL[] = [];

	for (const [rawKey, rawValue] of Object.entries(query.filters)) {
		const { baseKey, op } = parseFilterKey(rawKey);
		if (strictFilters && !filterable.includes(baseKey as any)) continue;

		const col = columns[baseKey as string];
		if (!col) continue;

		const values = Array.isArray(rawValue) ? rawValue : [rawValue];
		if (!values.length) continue;

		if (op === "eq") {
			if (values.length === 1) whereParts.push(eq(col, values[0]));
			else whereParts.push(orJoin(values.map((v) => eq(col, v))));
			continue;
		}

		const ops = values.map((v) => buildOp(col, op, v));

		if (ops.length === 1) whereParts.push(ops[0]);
		else if (ops.length > 1) whereParts.push(orJoin(ops));
	}

	if (query.search && searchable.length) {
		const term = `%${query.search}%`;
		const ors: SQL[] = [];
		for (const key of searchable) {
			const col = columns[key as string];
			if (col) ors.push(ilike(col, term));
		}
		if (ors.length === 1) whereParts.push(ors[0]);
		else if (ors.length > 1) whereParts.push(orJoin(ors));
	}

	const where =
		whereParts.length === 0
			? undefined
			: whereParts.length === 1
				? whereParts[0]
				: and(...whereParts);

	let orderBy: SQL | undefined;
	if (query.sort && sortable.includes(query.sort as any)) {
		const col = columns[query.sort as string];
		if (col) {
			orderBy =
				query.order === "desc"
					? ((col as any).desc?.() ?? (col as any))
					: ((col as any).asc?.() ?? (col as any));
		}
	}

	const offset = (query.page - 1) * query.limit;
	return { where, orderBy, offset, limit: query.limit };
}

type Operator = "eq" | "like" | "gt" | "gte" | "lt" | "lte";

function parseFilterKey(key: string): { baseKey: string; op: Operator } {
	const map: [string, Operator][] = [
		["_like", "like"],
		["_gte", "gte"],
		["_lte", "lte"],
		["_gt", "gt"],
		["_lt", "lt"],
	];
	for (const [suf, op] of map)
		if (key.endsWith(suf)) return { baseKey: key.slice(0, -suf.length), op };
	return { baseKey: key, op: "eq" };
}

function buildOp(col: PgColumn<any>, op: Operator, val: string): SQL {
	switch (op) {
		case "like":
			return ilike(col, `%${val}%`);
		case "gt":
			return gt(col as any, val);
		case "gte":
			return gte(col as any, val);
		case "lt":
			return lt(col as any, val);
		case "lte":
			return lte(col as any, val);
		case "eq":
		default:
			return eq(col as any, val);
	}
}

function posInt(v: unknown, fb: number) {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fb;
}
function clamp(n: number, min: number, max: number) {
	return Math.min(max, Math.max(min, n));
}
function str(v: unknown) {
	return typeof v === "string" ? v : "";
}

function orJoin(parts: SQL[]): SQL {
	if (parts.length === 1) return parts[0];
	let acc: SQL = parts[0];
	for (let i = 1; i < parts.length; i++) {
		const next = or(acc, parts[i]);
		if (next) acc = next;
	}
	return acc;
}
