export type SettingsFormValues = {
  about: string;
  copyright: string;
  primaryColor: string;
  accentColor: string;
  favicon: string;
  logo: string;
  backgroundImage: string;
};

export const DEFAULT_SETTINGS: SettingsFormValues = {
  about:
    "DFA Dashboard is to create your own dashboard and visualize your data.",
  copyright: "Copyright © 2020 DataForAll. All rights reserved.",
  primaryColor: "#990000",
  accentColor: "#7a0000",
  favicon: "",
  logo: "",
  backgroundImage: "",
};

export type SettingsSubTab = "about-copyright" | "theme";
