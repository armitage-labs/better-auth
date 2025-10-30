//#region src/client.ts
const creemClient = () => {
	return {
		id: "creem-client",
		$InferServerPlugin: {},
		pathMethods: {
			"/checkout/create": "POST",
			"/subscription/cancel": "POST",
			"/subscription/list": "GET",
			"/subscription/billing-portal": "POST"
		}
	};
};

//#endregion
export { creemClient };