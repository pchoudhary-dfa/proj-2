"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCore } from "@/contexts/CoreContext";
import { VendorChipSearch } from "@/components/VendorChipSearch";
import { DotNetworkBackground } from "@/components/DotNetworkBackground";
import type { Locale } from "@/lib/i18n/config";
import { ROUTES } from "@/lib/constants";
import { clearVizSearchHandoffFromSession } from "@/lib/visualizer/sessionAdapter";
import "@/lib/fontawesome";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";

export function LandingContent({ locale }: { locale: Locale }) {
  const { t } = useCore();
  const router = useRouter();
  const landingSearchStyle = useMemo(() => ({ height: 52 as const }), []);

  const handleAdvancedSearch = () => {
    clearVizSearchHandoffFromSession();
    router.push(`/${locale}${ROUTES.VISUALIZER}`);
  };

  return (
    <div className="relative min-h-full w-full flex flex-col items-center mt-6 sm:mt-8 -translate-y-6 sm:-translate-y-12">
      <DotNetworkBackground className="z-0" />
      <div className="relative z-10 max-w-5xl mx-auto w-full flex flex-col items-center text-center px-md sm:px-lg lg:px-xl py-md">
      <div className="flex flex-col items-center gap-md self-stretch mb-xl">
      <h1 className="font-heading font-bold text-xxl md:text-xxl leading-[1.2] flex flex-col items-center gap-sm">
          <span className="text-text">{t("LANDING_HERO_TITLE")}</span>
          <span className="text-primary">{t("LANDING_HERO_SUBTITLE")}</span>
        </h1>
      </div>

      <div id="dfaSearchMount" className="relative w-full">
        <VendorChipSearch locale={locale} style={landingSearchStyle} />
      </div>
        <div className="flex flex-row items-center justify-center mt-lg gap-lg">
            <div className="h-px w-20 bg-gradient-to-r from-transparent to-border" aria-hidden />
            <button className="btn-comp-primary" onClick={handleAdvancedSearch}>
              <TuneOutlinedIcon className="mui-icon-outlined" aria-hidden />
              <span>{t("LANDING_ADVANCED_SEARCH")}</span>
            </button>
            <div className="h-px w-20 bg-gradient-to-l from-transparent to-border" aria-hidden />
          </div>

        <p className="text-center text-text-muted text-sm mt-md font-body">
          {t("LANDING_ADVANCED_SEARCH_HINT")}
        </p>
      </div>
    </div>
  );
}
