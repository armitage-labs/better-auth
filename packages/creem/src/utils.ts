import type { CreemOptions } from "./types";

/**
 * Helper function to make authenticated requests to Creem API
 */
export async function creemApiRequest(
	apiKey: string,
	endpoint: string,
	options?: {
		method?: string;
		body?: any;
		apiBaseUrl?: string;
	},
) {
	const baseUrl = options?.apiBaseUrl || "https://api.creem.io";
	const url = `${baseUrl}${endpoint}`;

	const response = await fetch(url, {
		method: options?.method || "GET",
		headers: {
			"x-api-key": apiKey,
			"Content-Type": "application/json",
		},
		...(options?.body && { body: JSON.stringify(options.body) }),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Creem API Error: ${response.status} - ${error}`);
	}

	return await response.json();
}

/**
 * Verify webhook signature from Creem
 */
export function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string,
): boolean {
	// For now, we'll implement a basic comparison
	// In production, this should use HMAC verification
	// The actual implementation depends on Creem's webhook signature method
	if (!signature || !secret) {
		return false;
	}

	// This is a placeholder - adjust based on Creem's actual signature verification method
	// Typically this would involve HMAC-SHA256 or similar
	return signature === secret;
}
