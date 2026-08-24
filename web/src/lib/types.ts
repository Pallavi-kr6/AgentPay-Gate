// Mirrors backend/models.py. Kept in one file, deliberately close to the
// Pydantic models, so a backend field rename is a one-line diff here too -
// nothing is invented that the API doesn't actually return.

export type PolicyDecisionType = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";

export type TransactionStatus =
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "FAILED"
  | "REJECTED"
  | "PENDING";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  stock: number;
  tags: string[];
  description: string;
}

export interface CatalogItem extends Product {
  policy_state: "eligible" | "approval_required" | "blocked";
  policy_reason: string;
}

export interface PolicyCheckItem {
  label: string;
  passed: boolean;
  detail: string;
}

export interface AuditEvent {
  id: number;
  trace_id: string;
  timestamp: string;
  actor: string;
  event_type: string;
  decision: string | null;
  reason: string | null;
  payload: Record<string, unknown>;
}

export interface TransactionSummary {
  trace_id: string;
  product_id: string | null;
  product_name: string;
  agent: string;
  amount: number;
  currency: string;
  decision: PolicyDecisionType | null;
  status: TransactionStatus;
  created_at: string;
  updated_at: string;
}

export interface TransactionDetail {
  trace_id: string;
  product: Product | null;
  amount: number;
  currency: string;
  decision: PolicyDecisionType | null;
  status: TransactionStatus;
  reason: string;
  checks: PolicyCheckItem[];
  order_id: string | null;
  payment_id: string | null;
  payment_link: string | null;
  provider: string;
  created_at: string;
  updated_at: string;
  timeline: AuditEvent[];
}

export interface ApprovalItem {
  trace_id: string;
  product: Product | null;
  amount: number;
  currency: string;
  reason: string;
  payment_link: string | null;
  requested_at: string;
  buyer_ref: string;
}

export interface DashboardSummary {
  currency: string;
  daily_spent: number;
  daily_cap: number;
  per_transaction_cap: number;
  requires_approval_above: number;
  transactions_today: number;
  transactions_total: number;
  pending_approvals: number;
  policy_blocks_today: number;
}

export interface PolicyConfig {
  version: number;
  currency: string;
  per_transaction_cap: number;
  daily_cap: number;
  requires_approval_above: number;
  blocked_categories: string[];
  max_retries_on_failure: number;
  approval_link_expiry_minutes: number;
  daily_spent_so_far: number;
}

export interface PolicyUpdateRequest {
  per_transaction_cap: number;
  daily_cap: number;
  requires_approval_above: number;
  blocked_categories: string[];
  max_retries_on_failure: number;
  approval_link_expiry_minutes: number;
}

export interface PurchaseResult {
  trace_id: string;
  status: TransactionStatus;
  reason: string;
  amount: number;
  currency: string;
  product: Product | null;
  order_id: string | null;
  payment_link: string | null;
  payment_id: string | null;
}
