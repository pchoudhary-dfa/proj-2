/**
 * Auth types shared across auth service, context, and API clients.
 */

export interface UserRole {
  dw_id: string | null;
  role_id: number;
  role: string;
  role_name: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  isSuperAdmin: boolean;
  /** Auth provider: "LOCAL" for username/password, "SSO" for federated login */
  auth_provider?: string;
}

export interface SignInCredentials {
  username: string;
  password: string;
}

/** Payload for user registration (POST /auth/register). */
export interface RegisterPayload {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/** Shape returned by POST /auth/login. */
export interface AuthLoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  email: string;
  roles: UserRole[];
  permissions?: Record<string, {
    is_super_admin?: boolean;
    roles?: { role_id: number; role_code: string; role_name: string; dw_id: number | null }[];
  }>;
  /** Auth provider: "LOCAL" or "SSO" */
  auth_provider?: string;
}
