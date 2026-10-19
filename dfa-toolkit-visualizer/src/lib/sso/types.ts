/**
 * SSO-specific types
 */

/** SSO provider item returned by GET /auth/sso/providers */
export interface SsoProviderListItem {
  provider_code: string;
  display_name: string | null;
}

/** Backend auth response for SSO code exchange */
export interface SsoAuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: number;
  username: string;
  email: string;
  auth_provider?: string;
  permissions?: Record<
    string,
    {
      is_super_admin?: boolean;
      roles?: {
        role_id: number;
        role_code: string;
        role_name: string;
        dw_id: number | null;
      }[];
      resources?: { resource_code: string; permissions: string[] }[];
    }
  >;
}

/** BFF login response (tokens in httpOnly cookies; access_token included when proxy is off) */
export interface SsoBffLoginResponse {
  token_type: string;
  user_id: number;
  username: string;
  email: string;
  auth_provider?: string;
  /** Present only when ENABLE_API_PROXY is false so the client can send Bearer directly. */
  access_token?: string;
  permissions?: Record<
    string,
    {
      is_super_admin?: boolean;
      roles?: {
        role_id: number;
        role_code: string;
        role_name: string;
        dw_id: number | null;
      }[];
    }
  >;
}

/** BFF logout response */
export interface SsoBffLogoutResponse {
  success: boolean;
  logout_url?: string | null;
}

/** BFF refresh response */
export interface SsoBffRefreshResponse {
  success: boolean;
  token_type: string;
  /** Present only when ENABLE_API_PROXY is false so the client can update its stored Bearer. */
  access_token?: string;
}
