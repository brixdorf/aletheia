import type { ownerView, sharedView, summaryView } from "../../../server/src/api/views.ts";
import type { AuditPlan } from "../../../server/src/plan/types.ts";

export type {
  Bill,
  Charge,
  Page,
  PatternFinding,
  PatternId,
  PatternStatus,
  Screenshot,
  SiteReport,
  SubscriptionSummary,
} from "../../../server/src/judge/types.ts";

export type { Flow } from "../../../server/src/judge/types.ts";
export { PATTERN_IDS } from "../../../server/src/judge/types.ts";

export type PlanView = AuditPlan;
export type AuditView = ReturnType<typeof ownerView>;
/** What every audit screen can draw, so a report opened from a shared link works the same way. */
export type AuditPublic = ReturnType<typeof sharedView>;
export type AuditSummary = ReturnType<typeof summaryView>;
export type SiteView = AuditPublic["sites"][number];

export type SignInState = "setting_up" | "ready" | "in_use";

export interface SignInView {
  id: string;
  url: string;
  host: string;
  state: SignInState;
  expiresAt: string;
}

export interface ScreenFrame {
  /** A base64 JPEG. */
  data: string;
  width: number;
  height: number;
}
