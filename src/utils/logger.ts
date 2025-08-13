import pino from "pino";
import { environment } from "../environment";

const isProd = environment.NODE_ENV === "production";
const level = environment.LOG_LEVEL || (isProd ? "info" : "debug");
const pretty = environment.LOG_PRETTY && !isProd;

export const logger = pino({
	level,
	base: {
		app: environment.APP_NAME,
		env: process.env.NODE_ENV,
	},
	transport: pretty
		? {
				target: "pino-pretty",
				options: {
					colorize: true,
					translateTime: "SYS:standard",
					singleLine: false,
					ignore: "pid,hostname",
				},
			}
		: undefined,
	redact: {
		paths: ["req.headers.authorization", "password", "*.password", "salt"],
		remove: true,
	},
});

export function moduleLogger(module: string) {
	return logger.child({ module });
}
