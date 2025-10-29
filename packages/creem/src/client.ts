import type { BetterAuthClientPlugin } from "better-auth";
import type { creem } from "./index";

export const creemClient = () => {
	return {
		id: "creem-client",
		$InferServerPlugin: {} as ReturnType<
			typeof creem<{
				apiKey: string;
			}>
		>,
		pathMethods: {
			"/checkout/create": "POST",
			"/subscription/cancel": "POST",
			"/subscription/list": "GET",
			"/subscription/billing-portal": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
