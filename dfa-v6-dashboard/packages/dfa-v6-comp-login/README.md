# dfa-v6-comp-login

Self-contained React login component with built-in authentication API handling. Includes sign-in, registration with auto-login, password reset, PoW CAPTCHA, branding (logo, app name, tagline), and internationalization support. Styling uses design tokens when available.

This package is maintained as an **identical copy** in both **dfa-v6-datamanager** and **dfa-v6-visualizer** (`packages/dfa-v6-comp-login`). After changes in either repo, sync `src/`, rebuild with `npm run build`, and copy `dist/` to the other app so both stay in parity.

---

## Overview

- **Self-contained API calls**: pass `baseUrl` and `headers`; the component handles auth requests internally
- **Sign-in**: username + password, optional language selector, optional SSO slot via `renderAfterSubmit`
- **Register**: first/last name, username, email, password with complexity rules and auto-login after success
- **Forgot password**: username + CAPTCHA; API errors shown as toasts (via [sonner](https://sonner.emilkowal.ski/))
- **Reset confirm**: set a new password from an email link token (`initialResetToken`)
- **PoW CAPTCHA**: proof-of-work widget on sign-in, register, and forgot-password; submit buttons stay disabled until verified
- **Branding**: optional logo, app name, tagline (`loginTitle`), and description (`loginDescription`)
- **Internationalization**: all labels and messages overridable via the `strings` prop
- **Build**: Vite; output in `dist/`

---

## Install

From the package directory:

```bash
npm install
npm run build
```

---

## Usage

```tsx
import {
  Login,
  type LoginProps,
  type LoginStrings,
  type LoginResponse,
  type RegisterResponse,
} from "dfa-v6-comp-login";
import "dfa-v6-comp-login/styles.css";

<Login
  baseUrl="/api/auth"
  headers={{
    "X-Api-Key": "your-api-key",
  }}
  onLoginSuccess={(response, credentials) => {
    setAuthCookie(response.access_token);
    router.push("/dashboard");
  }}
  onRegisterSuccess={(response) => {
    toast.success("Registration successful!");
  }}
  onPasswordResetSuccess={(message) => {
    toast.success(message);
  }}
  logoUrl={logoUrl}
  appName="My App"
  version="6.0.0"
  strings={strings}
  enableCaptcha={true}
  renderAfterSubmit={ssoButtons}
/>
```

The component renders its own `<Toaster />` for register, forgot-password, and CAPTCHA errors. Sign-in errors still use the inline `error` prop / internal banner when credentials fail.

---

## Architecture

1. **Parent provides**: `baseUrl`, `headers`, success callbacks, optional branding/i18n
2. **Component handles**: API calls, validation, CAPTCHA, auto-login after registration
3. **Parent receives**: API responses via callbacks for storage, navigation, and success toasts

### API endpoints

Requests are made relative to `baseUrl`:

| Method | Path | Used for |
|--------|------|----------|
| `GET` | `/captcha/challenge` | Fetch PoW challenge (when `enableCaptcha` is true) |
| `POST` | `/login` | Sign in |
| `POST` | `/register` | Create account |
| `POST` | `/password/reset-request` | Forgot password |
| `POST` | `/password/reset-confirm` | Set new password from email link |

Login, register, and reset-request bodies include a `captcha` object `{ challenge_id, solution }` when CAPTCHA is enabled.

### CAPTCHA

- Enabled by default (`enableCaptcha={true}`). Pass `false` to disable the widget and omit captcha from API payloads.
- The widget solves the challenge in a Web Worker (no separate worker file in the host app).
- Submit buttons are disabled until the user completes “I'm not a robot”.
- If the challenge expires before submit, the widget resets and a toast shows `strings.captchaExpired`.
- **Host BFF**: expose `GET /captcha/challenge` on the same `baseUrl` the component uses (e.g. Next.js route proxying to the FastAPI auth API). DataManager and Visualizer each implement this in their app, not in this package.

### Auto-login after registration

On successful registration, the component fetches a fresh CAPTCHA (if enabled) and signs in automatically. If that succeeds, `onLoginSuccess` runs. If registration succeeded but auto-login fails, `onRegisterSuccess` runs instead.

### Error display

| Flow | Display |
|------|---------|
| Register validation / API errors | Toast |
| Forgot password API errors | Toast |
| CAPTCHA load / verify / expired | Toast |
| Sign-in credential / API errors | Inline banner (`error` prop or internal state) |

---

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `baseUrl` | `string` | **Yes** | — | Auth API base URL (often a same-origin BFF path) |
| `headers` | `Record<string, string>` | No | `{}` | Headers on every auth request |
| `onLoginSuccess` | `(response, credentials) => void \| Promise<void>` | **Yes** | — | After successful login |
| `onRegisterSuccess` | `(response) => void \| Promise<void>` | No | — | Registration OK but auto-login failed |
| `onPasswordResetSuccess` | `(message) => void \| Promise<void>` | No | — | Forgot-password request succeeded |
| `onResetConfirmSuccess` | `(message) => void \| Promise<void>` | No | — | Password reset confirm succeeded |
| `logoUrl` | `string` | No | — | Logo above app name |
| `appName` | `string` | No | — | Application title |
| `version` | `string` | No | — | Shown as “Version {version}” in footer |
| `copyrightText` | `string` | No | `strings.copyrightText` | Footer line from app-config `APP_FOOTER_NOTE` (pass as prop from host) |
| `onBack` | `() => void` | No | — | Back control on sign-in card only |
| `onForgotPasswordSuccess` | `() => void` | No | — | After forgot-password countdown reaches 0 |
| `initialMode` | `"signin" \| "register" \| "forgotpassword" \| "resetconfirm"` | No | `"signin"` | Starting view |
| `initialResetToken` | `string` | No | — | JWT from reset email; opens reset-confirm mode |
| `onModeChange` | `(mode) => void` | No | — | Notify host when internal mode changes |
| `renderAfterSubmit` | `React.ReactNode` | No | — | Slot below sign-in submit (e.g. SSO buttons) |
| `strings` | `LoginStrings` | No | — | i18n overrides |
| `error` | `string \| null` | No | — | External sign-in error message |
| `languages` | `{ value, label }[]` | No | — | Language dropdown options |
| `selectedLanguage` | `string` | No | — | Current language |
| `onLanguageChange` | `(value) => void` | No | — | Language change handler |
| `showRegisterPrompt` | `boolean` | No | `true` | “Don't have an account?” on sign-in |
| `enableCaptcha` | `boolean` | No | `true` | PoW CAPTCHA on sign-in, register, forgot-password |

### LoginResponse

```typescript
interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string | null;
  api_keys?: string[];
  roles?: { dw_id: number | null; role_id: number; role: string; role_name: string }[];
  permissions?: Record<string, unknown>;
}
```

### RegisterResponse

```typescript
interface RegisterResponse {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  password_auto_generated: boolean;
}
```

### LoginStrings (selected keys)

**Form**: `signIn`, `createAccount`, `forgotPassword`, `firstName`, `lastName`, `username`, `email`, `password`, `confirmPassword`, `language`

**Placeholders**: `enterUsername`, `enterPassword`, `reEnterPassword`, `enterFirstName`, `enterLastName`, `enterEmail`

**Forgot password**: `forgotPasswordTitle`, `forgotPasswordDescription`, `send`, `sending`, `passwordResetSuccessMessage`, `redirectingToLogin`, `backToSignIn`

**Reset confirm**: `resetPasswordTitle`, `resetPasswordDescription`, `newPassword`, `enterNewPassword`, `confirmNewPassword`, …

**Password rules**: `pwdRuleMinLength`, `pwdRuleUppercase`, `pwdRuleLowercase`, `pwdRuleNumber`, `pwdRuleSpecial`, `passwordValidationTitle`, `requiredFieldsError`

**CAPTCHA**: `notABot`, `captchaVerifying`, `captchaProtected`, `captchaPrivacy`, `captchaTerms`, `captchaExpired`

**Fallback errors**: `loginFailed`, `registrationFailed`, `passwordResetFailed`

**Navigation / branding**: `alreadyHaveAccountPrompt`, `signInLinkText`, `dontHaveAccountPrompt`, `registerHereLinkText`, `back`, `loginTitle`, `loginDescription`, `copyrightText`

### Captcha exports

```typescript
import type { CaptchaChallenge, CaptchaSolution, CaptchaInput } from "dfa-v6-comp-login";
```

---

## Design tokens

CSS variables align with `packages/design-tokens/tokens.css` when loaded:

- **Colors**: `--color-primary`, `--color-primary-hover`, `--color-on-primary`, `--color-surface`, `--color-text`, `--color-error`, …
- **Spacing / shape / shadow / typography**: `--spacing-*`, `--radius-*`, `--shadow-md`, `--font-*`, `--font-size-*`

Fallbacks are defined in `styles.css` when tokens are not loaded. SSO layout helpers (`.dtk-signin-sso-*`) are included for DataManager-style SSO rows outside the main submit button.

---

## Keeping DataManager and Visualizer in sync

1. Edit `src/` in one repo’s `packages/dfa-v6-comp-login`
2. Run `npm run build` in that package
3. Copy `src/` and `dist/` to the other repo’s `packages/dfa-v6-comp-login`
4. Wire app-level BFF routes and i18n in each host (`page.tsx` / `auth/page.tsx`, `translations.json`)

App integration differs (SSO, signing, proxy URLs); the **package source and build output should match** between repos.

---

## Requirements

- React 18+
- Node 18+ for build
