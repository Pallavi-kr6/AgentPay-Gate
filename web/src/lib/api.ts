import type {
  Product,
  CatalogItem,
  TransactionSummary,
  TransactionDetail,
  ApprovalItem,
  DashboardSummary,
  PolicyConfig,
  PolicyUpdateRequest,
  PurchaseResult,
  AuditEvent,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "We couldn't reach AgentPay Gate. Check that the backend is running and try again.",
      0
    );
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // no JSON body, keep default message
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------- catalog
export const getCatalog = () => request<CatalogItem[]>("/catalog");

export const searchCatalog = (params: { q?: string; category?: string; max_price?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.category) qs.set("category", params.category);
  if (params.max_price !== undefined) qs.set("max_price", String(params.max_price));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<Product[]>(`/catalog/search${suffix}`);
};

export const getProduct = (productId: string) => request<Product>(`/catalog/${productId}`);

// --------------------------------------------------------------- dashboard
export const getDashboardSummary = () => request<DashboardSummary>("/dashboard/summary");

// ------------------------------------------------------------ transactions
export const getTransactions = (limit = 100) =>
  request<TransactionSummary[]>(`/transactions?limit=${limit}`);

export const getTransaction = (traceId: string) =>
  request<TransactionDetail>(`/transactions/${traceId}`);

export const approveTransaction = (traceId: string) =>
  request<PurchaseResult>(`/transactions/${traceId}/approve`, { method: "POST" });

export const rejectTransaction = (traceId: string, reason: string) =>
  request<TransactionDetail>(
    `/transactions/${traceId}/reject?reason=${encodeURIComponent(reason)}`,
    { method: "POST" }
  );

// -------------------------------------------------------------- approvals
export const getApprovals = () => request<ApprovalItem[]>("/approvals");

// ----------------------------------------------------------------- policy
export const getPolicy = () => request<PolicyConfig>("/policy");

export const updatePolicy = (data: PolicyUpdateRequest) =>
  request<PolicyConfig>("/policy", { method: "PUT", body: JSON.stringify(data) });

// --------------------------------------------------------------- purchase
export const runPurchase = (productId: string, quantity = 1, forceFail = false) =>
  request<PurchaseResult>(`/purchase${forceFail ? "?force_fail=true" : ""}`, {
    method: "POST",
    body: JSON.stringify({ product_id: productId, quantity }),
  });

export const confirmPayment = (traceId: string, paymentId: string, mockStatus: "captured" | "failed") =>
  request<PurchaseResult>(
    `/purchase/${traceId}/confirm?payment_id=${encodeURIComponent(paymentId)}&mock_status=${mockStatus}`,
    { method: "POST" }
  );

// ------------------------------------------------------------------ audit
export const getRecentAuditEvents = (limit = 100) =>
  request<AuditEvent[]>(`/audit/recent?limit=${limit}`);

export const getAuditTrail = (traceId: string) => request<AuditEvent[]>(`/audit/${traceId}`);

// ------------------------------------------------------------ demo runner
/** Sequences REAL purchases against the real backend to tell the four-outcome
 * story (ALLOW / REQUIRE_APPROVAL / BLOCK / graceful failure). No fake data -
 * every call below is the same endpoint a real agent would call. */
export async function runDemoScenario(
  scenario: "allow" | "approval" | "block" | "failure"
): Promise<PurchaseResult> {
  switch (scenario) {
    case "allow":
      return runPurchase("sku_earbuds_01", 1);
    case "approval":
      return runPurchase("sku_speaker_01", 1);
    case "block":
      return runPurchase("sku_laptop_01", 1);
    case "failure":
      return runPurchase("sku_tshirt_01", 1, true);
  }
}

export async function runFullDemo(
  onStep?: (label: string, result: PurchaseResult) => void
): Promise<PurchaseResult[]> {
  const steps: Array<["allow" | "approval" | "block" | "failure", string]> = [
    ["allow", "Successful purchase"],
    ["approval", "Approval required"],
    ["block", "Policy blocked"],
    ["failure", "Payment failure"],
  ];
  const results: PurchaseResult[] = [];
  for (const [scenario, label] of steps) {
    const result = await runDemoScenario(scenario);
    results.push(result);
    onStep?.(label, result);
    await new Promise((r) => setTimeout(r, 600));
  }
  return results;
}
