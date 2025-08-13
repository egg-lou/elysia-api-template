import { Elysia } from "elysia";
import swagger from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";

import { environment } from "./environment";
import { loggingPlugin } from "./middleware/loggingPlugin";
import { logger } from "./utils/logger";

const app = new Elysia();

app.use(swagger());
app.use(loggingPlugin);
app.use(cors());
app
	.get("/", () => `Welcome to the ${environment.APP_NAME} API!`)
	.use(new Elysia({ prefix: "/api" }))
	.onStart(() => {
		logger.info(`${environment.APP_NAME} API is starting...`);
	})
	.onStop(() => {
		logger.info(`${environment.APP_NAME} API is stopping...`);
	});

app.listen(environment.PORT, () => {
	console.log(`Server is running on port ${environment.PORT}`);
});
