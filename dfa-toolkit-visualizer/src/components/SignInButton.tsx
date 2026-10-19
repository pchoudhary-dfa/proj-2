"use client";

import Link from "next/link";
import { useCore } from "@/contexts/CoreContext";
import "@/lib/fontawesome";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export function SignInButton({ href = "/auth?route=signin" }: { href?: string }) {
  const { t } = useCore();

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-white shadow-md transition-all hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    >
      <FontAwesomeIcon
        icon={"fa-solid fa-right-to-bracket" as unknown as never}
        className="text-[18px]"
      />
      <span className="font-normal">{t("HEADER_SIGN_IN")}</span>
    </Link>
  );
}

