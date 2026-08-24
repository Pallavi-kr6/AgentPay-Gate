"""
Central configuration. Everything is env-driven so the same codebase runs in
three modes without touching code:

  1. PAYMENT_PROVIDER=mock      -> zero external dependencies, deterministic,
                                    safe for CI / judges who just cloned the repo.
  2. PAYMENT_PROVIDER=razorpay  -> real Razorpay TEST MODE (no real money moves,
                                    but real API calls / real payment links).

  AGENT_MODE=rule_based  -> no LLM call at all, deterministic buyer agent.
  AGENT_MODE=groq        -> real Groq-hosted LLM with tool calling.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Payments -----------------------------------------------------------
PAYMENT_PROVIDER = os.getenv("PAYMENT_PROVIDER", "mock").lower()  # mock | razorpay
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

# --- Agent / LLM ----------------------------------------------------------
AGENT_MODE = os.getenv("AGENT_MODE", "rule_based").lower()  # rule_based | groq
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# --- Backend service --------------------------------------------------
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
# The Next.js dashboard app. The mock checkout link and the Razorpay Payment
# Link's callback_url point here (not at the backend) because the human
# approval page is a page in that app, not something FastAPI renders.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# --- Data files -----------------------------------------------------------
CATALOG_PATH = Path(os.getenv("CATALOG_PATH", BASE_DIR / "data" / "catalog.json"))
POLICY_PATH = Path(os.getenv("POLICY_PATH", BASE_DIR / "data" / "policy.json"))
DB_PATH = Path(os.getenv("DB_PATH", BASE_DIR / "data" / "audit.db"))
JSONL_AUDIT_PATH = Path(os.getenv("JSONL_AUDIT_PATH", BASE_DIR / "data" / "audit.jsonl"))
