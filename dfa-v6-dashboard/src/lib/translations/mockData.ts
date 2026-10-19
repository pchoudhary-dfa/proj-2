export type TranslationRow = {
  id: string;
  code: string;
  sourceText: string;
  targets: Record<string, string>;
};

export const MOCK_TRANSLATION_ROWS: TranslationRow[] = [
  {
    id: "ACCOUNT_TYPE",
    code: "ACCOUNT_TYPE",
    sourceText: "Account Type",
    targets: { fr: "Type de compte" },
  },
  {
    id: "DASHBOARD_PRIVATE_HELP_TEXT",
    code: "DASHBOARD_PRIVATE_HELP_TEXT",
    sourceText:
      "When enabled, this dashboard becomes login-protected.",
    targets: {
      fr: "Lorsque cette option est activee, ce tableau de bord est protege.",
    },
  },
  {
    id: "OWNER",
    code: "OWNER",
    sourceText: "Owner",
    targets: { fr: "Proprietaire" },
  },
  {
    id: "SELECT_ROLE",
    code: "SELECT_ROLE",
    sourceText: "Select Role",
    targets: { fr: "Selectionner le role" },
  },
  {
    id: "ADD_USERS",
    code: "ADD_USERS",
    sourceText: "Add Users",
    targets: { fr: "Ajouter des utilisateurs" },
  },
];
