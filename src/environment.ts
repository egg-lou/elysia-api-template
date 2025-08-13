import dotenv from "dotenv";

dotenv.config();

export const environment = {
	APP_NAME: process.env.APP_NAME || "app",
	NODE_ENV: process.env.NODE_ENV || "development",
	PORT: process.env.PORT || 8080,
	DATABASE_URL: process.env.DATABASE_URL!,
	JWT_SECRET: process.env.JWT_SECRET!,
	LOG_LEVEL: process.env.LOG_LEVEL || "info",
	LOG_PRETTY: process.env.LOG_PRETTY === "true" || false,
};
