import type {
  ComputeLogDetailRow,
  ComputeLogSourceDetailRow,
} from "@/lib/api/computeExecutionLogs";

const IUS_DELIMITERS = ["{||}", "|"] as const;

/** User-facing separator for indicator / unit / subgroup (matches execute grid labels). */
export const IUS_DISPLAY_SEPARATOR = " - ";

export function splitIusNameString(
  name: string | null | undefined
): { iname: string; uname: string; sname: string } {
  const text = (name ?? "").trim();
  if (!text) return { iname: "", uname: "", sname: "" };
  for (const delim of IUS_DELIMITERS) {
    if (text.includes(delim)) {
      const parts = text.split(delim).map((p) => p.trim());
      return {
        iname: parts[0] ?? "",
        uname: parts[1] ?? "",
        sname: parts[2] ?? "",
      };
    }
  }
  return { iname: text, uname: "", sname: "" };
}

/** Turn API composite IUS name (``{||}`` / ``|``) into a readable label. */
export function formatCompositeIusDisplayLabel(
  name: string | null | undefined
): string {
  const { iname, uname, sname } = splitIusNameString(name);
  const parts = [iname, uname, sname].map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(IUS_DISPLAY_SEPARATOR) : (name ?? "").trim();
}

type SourceDetailRaw = ComputeLogSourceDetailRow & { name?: string };

function normalizeSourceDetail(
  src: SourceDetailRaw,
  parent: Pick<
    ComputeLogDetailRow,
    | "target_iname"
    | "target_uname"
    | "target_sname"
    | "area_name"
    | "area_id"
    | "time_period"
  >
): ComputeLogSourceDetailRow {
  let { iname, uname, sname } = splitIusNameString(src.name);
  if (!iname && !uname && !sname) {
    const joined = [src.iname, src.uname, src.sname].filter(Boolean).join("|");
    ({ iname, uname, sname } = splitIusNameString(joined));
  }
  const dvRaw = src.dv;
  const dv =
    dvRaw == null || dvRaw === ""
      ? null
      : typeof dvRaw === "number"
        ? dvRaw
        : Number(dvRaw);
  return {
    iname: iname || parent.target_iname,
    uname: uname || parent.target_uname,
    sname: sname || parent.target_sname,
    area: src.area?.trim() || parent.area_name || parent.area_id || "",
    timeperiod: src.timeperiod?.trim() || parent.time_period || "",
    source: src.source?.trim() || "",
    dv: dv != null && Number.isFinite(dv) ? dv : null,
  };
}

export function normalizeLogDetailRow(row: ComputeLogDetailRow): ComputeLogDetailRow {
  const combined = [row.target_iname, row.target_uname, row.target_sname]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join("|");
  const splitFrom =
    combined.includes("|") || combined.includes("{||}")
      ? combined
      : row.target_iname?.trim() || row.ius_gid || "";
  const fromName = splitIusNameString(splitFrom);
  const target_iname = row.target_iname?.trim() || fromName.iname;
  const target_uname = row.target_uname?.trim() || fromName.uname;
  const target_sname = row.target_sname?.trim() || fromName.sname;

  const parent = {
    ...row,
    target_iname,
    target_uname,
    target_sname,
  };

  let rawSources: SourceDetailRaw[] = [];
  const raw = row.source_details as unknown;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) rawSources = parsed as SourceDetailRaw[];
    } catch {
      rawSources = [];
    }
  } else if (Array.isArray(raw)) {
    rawSources = raw as SourceDetailRaw[];
  }
  const source_details = rawSources.map((src) =>
    normalizeSourceDetail(src as SourceDetailRaw, parent)
  );

  return { ...parent, source_details };
}
