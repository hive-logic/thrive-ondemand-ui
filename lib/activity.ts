import { AGENT_HOST } from "./ws";

export type ActivityStatus = "active" | "not_active" | "invalid";

export async function checkActivityValidity(
  activityId: string | null | undefined
): Promise<ActivityStatus> {
  const trimmed = (activityId || "").trim();
  if (!trimmed) {
    return "invalid";
  }

  if (typeof fetch === "undefined") {
    return "invalid";
  }

  const url = `https://${AGENT_HOST}/v1/check_activity_validity?activity=${encodeURIComponent(
    trimmed
  )}`;

  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      return "invalid";
    }
    const data: any = await res.json();
    // Backend şu an bazı durumlarda "status", bazı durumlarda "detail"
    // alanını kullanabiliyor; her ikisini de destekle.
    const status = data?.status ?? data?.detail;
    if (status === "active" || status === "not_active" || status === "invalid") {
      return status;
    }
    return "invalid";
  } catch {
    return "invalid";
  }
}


