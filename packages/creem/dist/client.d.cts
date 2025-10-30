import { n as creem } from "./index-Wgq416qZ.cjs";

//#region src/client.d.ts
declare const creemClient: () => {
  id: "creem-client";
  $InferServerPlugin: ReturnType<typeof creem<{
    apiKey: string;
  }>>;
  pathMethods: {
    "/checkout/create": "POST";
    "/subscription/cancel": "POST";
    "/subscription/list": "GET";
    "/subscription/billing-portal": "POST";
  };
};
//#endregion
export { creemClient };