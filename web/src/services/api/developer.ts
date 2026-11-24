import { http } from "@/services/api/request";

export type ApiToken = { id: string; name: string; prefix: string; lastUsedAt?: string | null; createdAt: string };
export type CreatedApiToken = ApiToken & { token: string };
export type OAuthConnection = { clientId: string; clientName: string; createdAt: string; lastUsedAt?: string | null };
export type OAuthAuthorizeInfo = { clientId: string; clientName: string; clientUri?: string; redirectHost: string };
export type OAuthAuthorizeRequest = {
    clientId: string;
    redirectUri: string;
    responseType: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    state: string;
    resource: string;
};

export async function listApiTokens() {
    return (await http.get<{ tokens: ApiToken[] }>("/api-tokens")).tokens;
}

export async function createApiToken(name: string) {
    return (await http.post<{ token: CreatedApiToken }>("/api-tokens", { name })).token;
}

export function revokeApiToken(id: string) {
    return http.delete<{ revoked: boolean }>(`/api-tokens/${encodeURIComponent(id)}`);
}

export async function listOAuthConnections() {
    return (await http.get<{ connections: OAuthConnection[] }>("/oauth/connections")).connections;
}

export function revokeOAuthConnection(clientId: string) {
    return http.delete<{ revoked: boolean }>(`/oauth/connections/${encodeURIComponent(clientId)}`);
}

export function getOAuthAuthorizeInfo(clientId: string, redirectUri: string) {
    return http.get<OAuthAuthorizeInfo>("/oauth/authorize", { params: { client_id: clientId, redirect_uri: redirectUri } });
}

export async function submitOAuthAuthorization(request: OAuthAuthorizeRequest, approve: boolean) {
    return (await http.post<{ redirectUrl: string }>("/oauth/authorize", { ...request, approve })).redirectUrl;
}
