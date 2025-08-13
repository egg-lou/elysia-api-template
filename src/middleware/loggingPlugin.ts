import { Elysia } from "elysia";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";

export const loggingPlugin = new Elysia({ name: "logging" })
	.decorate("log", logger)
	.onRequest(({ request, store, set }) => {
		const rid = request.headers.get("x-request-id") || randomUUID();
		store.reqId = rid;
		set.headers["x-request-id"] = rid;
		(request as any)._start = performance.now();
		logger.info({
			msg: "request:start",
			rid,
			method: request.method,
			path: new URL(request.url).pathname,
		});
	})
	.onAfterHandle(({ request, response, store }) => {
		const start = (request as any)._start;
		const ms = start ? +(performance.now() - start).toFixed(2) : undefined;
		logger.info({
			msg: "request:done",
			rid: store.reqId,
			status: (response as any)?.status ?? 200,
			duration: ms,
		});
	})
	.onError(({ code, error, store, request }) => {
		logger.error({
			msg: "request:error",
			rid: store.reqId,
			code,
			method: request.method,
			path: new URL(request.url).pathname,
			err: {
				name: error.name,
				message: error.message,
				stack: error.stack,
			},
		});
	});
