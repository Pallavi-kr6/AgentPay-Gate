#!/usr/bin/env bash
# One-command setup + run for judges/reviewers. Zero credentials needed.
set -e
cd "$(dirname "$0")/.."

if [ ! -d ".venv" ]; then
  echo "Creating virtualenv..."
  python3 -m venv .venv
fi
source .venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

echo
echo "Running the test suite (16 tests, pure logic + FastAPI TestClient, no network)..."
pytest tests/ -v

echo
echo "Starting the backend at http://127.0.0.1:8000 (PAYMENT_PROVIDER=mock, no keys needed)"
echo "Dashboard: http://127.0.0.1:8000/dashboard"
echo "Docs:      http://127.0.0.1:8000/docs"
echo
PAYMENT_PROVIDER=mock uvicorn backend.main:app --reload
