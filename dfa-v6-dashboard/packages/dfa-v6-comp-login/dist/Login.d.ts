import { default as React } from 'react';
export interface LoginResponse {
    access_token: string;
    token_type: string;
    user_id: number;
    username: string;
    first_name?: string | null;
    last_name?: string | null;
    email: string | null;
    api_keys?: string[];
    roles?: {
        dw_id: number | null;
        role_id: number;
        role: string;
        role_name: string;
    }[];
    permissions?: Record<string, unknown>;
}
export interface RegisterResponse {
    user_id: number;
    username: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    password_auto_generated: boolean;
}
export interface RegisterPayload {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}
export interface LoginStrings {
    signIn?: string;
    createAccount?: string;
    forgotPassword?: string;
    alreadyHaveAccountPrompt?: string;
    signInLinkText?: string;
    dontHaveAccountPrompt?: string;
    registerHereLinkText?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    email?: string;
    emailId?: string;
    password?: string;
    confirmPassword?: string;
    language?: string;
    enterUsername?: string;
    enterPassword?: string;
    reEnterPassword?: string;
    enterFirstName?: string;
    enterLastName?: string;
    enterEmail?: string;
    signInError?: string;
    passwordsDoNotMatch?: string;
    registrationNotAvailable?: string;
    /** Tagline under app name (e.g. "Explore. Visualize. Share."). From translation LOGIN_TITLE. */
    loginTitle?: string;
    /** Description under tagline. From translation LOGIN_DESCRIPTION. */
    loginDescription?: string;
    /** Label after the back arrow icon (e.g. "Back"). */
    back?: string;
    /** Forgot Password card title. */
    forgotPasswordTitle?: string;
    /** Forgot Password card description. */
    forgotPasswordDescription?: string;
    /** Send button label in forgot password form. */
    send?: string;
    /** Sending… label while submitting forgot password. */
    sending?: string;
    /** Success banner after password reset request. */
    passwordResetSuccessMessage?: string;
    /** Countdown prefix text (e.g. "Redirecting to login page in"). */
    redirectingToLogin?: string;
    /** Back to Sign In button label. */
    backToSignIn?: string;
    /** Fallback error message for login API failure. */
    loginFailed?: string;
    /** Fallback error message for registration API failure. */
    registrationFailed?: string;
    /** Fallback error message for password reset API failure. */
    passwordResetFailed?: string;
    /** Password validation rule: minimum length. */
    pwdRuleMinLength?: string;
    /** Password validation rule: uppercase letter. */
    pwdRuleUppercase?: string;
    /** Password validation rule: lowercase letter. */
    pwdRuleLowercase?: string;
    /** Password validation rule: number. */
    pwdRuleNumber?: string;
    /** Password validation rule: special character. */
    pwdRuleSpecial?: string;
    /** Toast title when password validation fails. */
    passwordValidationTitle?: string;
    /** Error message for required fields. */
    requiredFieldsError?: string;
    /** Reset-confirm card title (e.g. "Set New Password"). */
    resetPasswordTitle?: string;
    /** Reset-confirm card description. */
    resetPasswordDescription?: string;
    /** Label for new password field in reset-confirm. */
    newPassword?: string;
    /** Placeholder for new password field in reset-confirm. */
    enterNewPassword?: string;
    /** Label/placeholder text for confirming new password in reset-confirm. */
    confirmNewPassword?: string;
    /** Submit button label in reset-confirm form. */
    setPassword?: string;
    /** Submitting label in reset-confirm form. */
    settingPassword?: string;
    /** Success message after password reset confirm. */
    passwordResetConfirmSuccessMessage?: string;
    /** Error message for reset-confirm API failure. */
    passwordResetConfirmFailed?: string;
    /** Error shown when reset link token is missing or invalid. */
    invalidResetToken?: string;
    /** Strength label: Weak. */
    strengthWeak?: string;
    /** Strength label: Fair. */
    strengthFair?: string;
    /** Strength label: Good. */
    strengthGood?: string;
    /** Strength label: Strong. */
    strengthStrong?: string;
    /** Strength label: Excellent. */
    strengthExcellent?: string;
    /** Bot-check / captcha checkbox label (e.g. "I'm not a robot"). */
    notABot?: string;
    /** Shown while the captcha mock loader runs. */
    captchaVerifying?: string;
    /** Captcha badge line (decorative until real provider is wired). */
    captchaProtected?: string;
    /** Captcha legal link label. */
    captchaPrivacy?: string;
    /** Captcha legal link label. */
    captchaTerms?: string;
    /** Shown when PoW CAPTCHA expires before submit. */
    captchaExpired?: string;
    /** Footer copyright line fallback when host does not pass `copyrightText` from app-config `APP_FOOTER_NOTE`. */
    copyrightText?: string;
}
export interface LoginProps {
    baseUrl: string;
    headers?: Record<string, string>;
    onLoginSuccess: (response: LoginResponse, credentials: {
        username: string;
    }) => void | Promise<void>;
    onRegisterSuccess?: (response: RegisterResponse) => void | Promise<void>;
    onPasswordResetSuccess?: (message: string) => void | Promise<void>;
    onResetConfirmSuccess?: (message: string) => void | Promise<void>;
    logoUrl?: string;
    appName?: string;
    /** Version number only (e.g. "5.4.12"). Component displays "Version {version}". */
    version?: string;
    /** Optional override for footer copyright; defaults to app-config `APP_FOOTER_NOTE` via `copyrightText` prop or `strings.copyrightText`. */
    copyrightText?: string;
    /** When set, the sign-in card shows a back control at the bottom (e.g. `router.back()`). Not shown on register. */
    onBack?: () => void;
    /** Optional hook called after the post-success countdown reaches 0 (e.g. to show a toast in the host). */
    onForgotPasswordSuccess?: () => void;
    initialMode?: "signin" | "register" | "forgotpassword" | "resetconfirm";
    /** JWT token from the password-reset email link. When provided, the component starts in resetconfirm mode. */
    initialResetToken?: string;
    /** Called whenever the internal view mode changes (e.g. signin → forgotpassword). Lets the host sync the URL. */
    onModeChange?: (mode: "signin" | "register" | "forgotpassword" | "resetconfirm") => void;
    /** Rendered inside the sign-in card between the submit button and the bottom row (e.g. SSO buttons). Only shown in signin mode. */
    renderAfterSubmit?: React.ReactNode;
    strings?: LoginStrings;
    error?: string | null;
    languages?: {
        value: string;
        label: string;
    }[];
    selectedLanguage?: string;
    onLanguageChange?: (value: string) => void;
    /** Controls visibility of "Don't have an account? Register here." prompt on sign-in view. */
    showRegisterPrompt?: boolean;
    /** PoW CAPTCHA on sign-in, register, and forgot-password. Defaults to true; pass false to disable. */
    enableCaptcha?: boolean;
}
export declare function Login({ baseUrl, headers, onLoginSuccess, onRegisterSuccess, onPasswordResetSuccess, onResetConfirmSuccess, logoUrl, appName, version, copyrightText: copyrightTextProp, onBack, onForgotPasswordSuccess, initialMode, initialResetToken, onModeChange, renderAfterSubmit, strings: stringsProp, error: externalError, languages, selectedLanguage, onLanguageChange, showRegisterPrompt, enableCaptcha, }: LoginProps): import("react/jsx-runtime").JSX.Element;
