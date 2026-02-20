import type { InviteOnlyPluginOptions } from "./types";
import { generateInviteCode } from "./utils";

export async function resolveIsAdmin(
	user: { id: string; role?: string; [key: string]: any },
	customIsAdmin?: InviteOnlyPluginOptions["isAdmin"],
	logger?: any,
): Promise<boolean> {
	if (customIsAdmin) return customIsAdmin(user);
	if (user.role === undefined && logger) {
		logger.warn?.(
			"invite-only: user.role is undefined — all admin checks will fail. Provide a custom isAdmin function.",
		);
	}
	return user.role === "admin";
}

export async function makeCode(
	customGenerateCode?: () => string | Promise<string>,
	codeLengthBytes = 16,
): Promise<string> {
	if (customGenerateCode) return customGenerateCode();
	return generateInviteCode(codeLengthBytes);
}

export function getBaseUrl(ctx: any, baseUrl?: string): string {
	if (baseUrl) return baseUrl;
	const fromCtx = ctx.context?.options?.baseURL || ctx.context?.baseURL;
	if (fromCtx) return fromCtx.replace(/\/api\/auth\/?$/, "");
	return "";
}

export interface AdminEndpointOptions {
	expiresInSeconds: number;
	codeLengthBytes: number;
	customGenerateCode?: () => string | Promise<string>;
	sendInviteEmail?: InviteOnlyPluginOptions["sendInviteEmail"];
	customIsAdmin?: InviteOnlyPluginOptions["isAdmin"];
	baseUrl?: string;
	registerPath: string;
}
