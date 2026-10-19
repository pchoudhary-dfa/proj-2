import type { Config } from "tailwindcss";

const styleguideConfig: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-hover": "var(--color-primary-hover)",
        "primary-soft": "var(--color-primary-overlay)",
        "primary-subtle": "var(--color-primary-subtle)",
        "primary-emphasis": "var(--color-primary-emphasis)",
        "primary-deep": "var(--color-primary-deep)",
        "on-primary": "var(--color-on-primary)",
        "on-primary-border": "var(--color-on-primary-border)",
        "on-primary-surface": "var(--color-on-primary-surface)",
        "on-primary-surface-emphasis": "var(--color-on-primary-surface-emphasis)",
        "on-primary-fg": "var(--color-on-primary-fg)",
        "on-primary-fg-muted": "var(--color-on-primary-fg-muted)",
        "on-primary-fg-dim": "var(--color-on-primary-fg-dim)",

        surface: "var(--color-surface)",
        "surface-muted": "var(--color-surface-muted)",
        "surface-elevated": "var(--color-surface-elevated)",
        "surface-scrim": "var(--color-surface-scrim)",
        "surface-muted-blend": "var(--color-surface-muted-blend)",
        "surface-hover-tint": "var(--color-surface-hover-tint)",
        "surface-hover-overlay": "var(--color-surface-hover-overlay)",

        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",

        border: "var(--color-border)",
        "muted-border": "var(--color-muted-border)",
        "muted-subtle": "var(--color-muted-subtle)",

        success: "var(--color-success)",
        "success-subtle": "var(--color-success-subtle)",
        "success-border": "var(--color-success-border)",
        "success-hover": "var(--color-success-hover)",
        "success-disabled": "var(--color-success-disabled)",
        warning: "var(--color-warning)",
        "warning-subtle": "var(--color-warning-subtle)",
        "warning-border": "var(--color-warning-border)",
        "warning-overlay": "var(--color-warning-overlay)",
        error: "var(--color-error)",
        "error-subtle": "var(--color-error-subtle)",
        "error-border": "var(--color-error-border)",
        "error-hover-bg": "var(--color-error-hover-bg)",
        danger: "var(--color-danger)",
        "danger-hover": "var(--color-danger-hover)",
        "danger-disabled": "var(--color-danger-disabled)",
        info: "var(--color-info)",
      },

      spacing: {
        xs: "var(--spacing-xs)",
        sm: "var(--spacing-sm)",
        md: "var(--spacing-md)",
        lg: "var(--spacing-lg)",
        xl: "var(--spacing-xl)",
      },

      fontFamily: {
        body: "var(--font-body)",
        heading: "var(--font-heading)",
      },

      fontSize: {
        xs: "var(--font-size-xs)",
        sm: "var(--font-size-sm)",
        md: "var(--font-size-md)",
        lg: "var(--font-size-lg)",
        xl: "var(--font-size-xl)",
        xxl: "var(--font-size-xxl)",
      },

      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },

      boxShadow: {
        header: "var(--shadow-header)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "focus-ring": "var(--shadow-focus-ring)",
      },

      height: {
        header: "var(--height-header)",
        breadcrumb: "var(--height-breadcrumb)",
        "toggle-track-sm": "var(--height-toggle-track-sm)",
        icon: "2rem",
      },

      minHeight: {
        header: "var(--height-header)",
      },

      width: {
        sidebar: "var(--width-sidebar)",
        icon: "2rem",
      },

      zIndex: {
        tooltip: "var(--z-tooltip)",
      },

      loaderSize: {
        default: "var(--default-loader-size)",
      },
    },
  },
  plugins: [],
};

export default styleguideConfig;
