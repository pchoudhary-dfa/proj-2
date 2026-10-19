import { NextResponse } from "next/server";

/**
 * Health endpoint for Kubernetes startup/liveness/readiness probes.
 * Returns HTTP 200 so the pod can pass the startup probe.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "dfa-v6-datamanager",
    },
    { status: 200 }
  );
}
