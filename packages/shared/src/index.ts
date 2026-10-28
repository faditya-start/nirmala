export const PRODUCT_NAME = "NIRMALA";
export const PRODUCT_SUBTITLE = "Budget Review & Follow-up Intelligence";

export const RISK_CATEGORIES = ["low", "medium", "high"] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface SessionUser {
  id: string;
  name: string;
  role: "reviewer" | "leader" | "admin";
}
