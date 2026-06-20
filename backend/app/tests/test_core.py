import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app
from app.models import Event, LedgerEntry, Redemption

TEST_DATABASE_URL = "sqlite:///./test_loyalty.db"

@pytest.fixture(scope="function")
def db():
    # Remove existing test db file if it somehow exists
    if os.path.exists("./test_loyalty.db"):
        try:
            os.remove("./test_loyalty.db")
        except OSError:
            pass

    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)

    # Clean up file
    if os.path.exists("./test_loyalty.db"):
        try:
            os.remove("./test_loyalty.db")
        except OSError:
            pass

@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_event_ingestion_idempotency(client, db):
    # 1. Ingest event first time (Wednesday)
    payload = {
        "event_id": "evt_test_001",
        "user_id": "user_123",
        "event_type": "deposit",
        "amount": 1000.0,
        "timestamp": "2026-06-17T10:30:00"  # Wednesday
    }
    
    response = client.post("/events", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "processed"
    # Deposit calculation: 1000 amount / 100 unit = 10 units. 10 * 1 points_per_unit = 10. 10 + 10 base_bonus = 20.
    # No weekend multiplier (Wednesday).
    assert data["points_awarded"] == 20
    assert data["current_balance"] == 20
    
    # Verify event stored in database
    db_event = db.query(Event).filter(Event.event_id == "evt_test_001").first()
    assert db_event is not None
    assert db_event.points_awarded == 20
    
    # 2. Ingest same event again (Idempotency Check)
    response_dup = client.post("/events", json=payload)
    assert response_dup.status_code == 200
    data_dup = response_dup.json()
    assert data_dup["status"] == "duplicate"
    assert data_dup["points_awarded"] == 20
    assert data_dup["current_balance"] == 20
    
    # Verify only one ledger entry created
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.user_id == "user_123").all()
    assert len(ledger_entries) == 1
    assert ledger_entries[0].points == 20

def test_insufficient_balance_redemption(client, db):
    # Try to redeem without points
    payload = {
        "user_id": "user_poor",
        "reward_id": "coffee_voucher"
    }
    response = client.post("/redeem", json=payload)
    assert response.status_code == 400
    assert "insufficient balance" in response.json()["detail"].lower()
    
    # Verify no ledger debit entry was made
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.user_id == "user_poor").all()
    assert len(ledger_entries) == 0

def test_successful_redemption(client, db):
    # 1. Add points (Saturday deposit for multiplier check)
    payload_event = {
        "event_id": "evt_rich_001",
        "user_id": "user_rich",
        "event_type": "deposit",
        "amount": 1000.0,
        "timestamp": "2026-06-20T10:30:00"  # Saturday
    }
    # Base points = 20. Weekend multiplier x2 = 40.
    client.post("/events", json=payload_event)
    
    # Add another event to cross 50 points
    payload_event_2 = {
        "event_id": "evt_rich_002",
        "user_id": "user_rich",
        "event_type": "deposit",
        "amount": 1000.0,
        "timestamp": "2026-06-20T11:30:00"  # Saturday
    }
    client.post("/events", json=payload_event_2)
    # Total points = 80.
    
    # Verify balance
    balance_resp = client.get("/users/user_rich/balance")
    assert balance_resp.json()["balance"] == 80
    
    # 2. Redeem Coffee Voucher (50 points)
    payload_redeem = {
        "user_id": "user_rich",
        "reward_id": "coffee_voucher"
    }
    response = client.post("/redeem", json=payload_redeem)
    assert response.status_code == 200
    data = response.json()
    assert data["reward_name"] == "Coffee Voucher"
    assert data["points_spent"] == 50
    assert data["remaining_balance"] == 30
    
    # Verify ledger entries (CREDIT 40, CREDIT 40, DEBIT -50)
    ledger_entries = db.query(LedgerEntry).filter(LedgerEntry.user_id == "user_rich").all()
    assert len(ledger_entries) == 3
    debits = [le for le in ledger_entries if le.entry_type == "DEBIT"]
    assert len(debits) == 1
    assert debits[0].points == -50

def test_reversal_creates_compensating_ledger_entry(client, db):
    # 1. Earn points
    payload = {
        "event_id": "evt_rev_01",
        "user_id": "user_rev",
        "event_type": "purchase",
        "amount": 500.0,
        "timestamp": "2026-06-17T10:30:00"  # Wednesday
    }
    # Purchase points: (500 / 100) * 2 + 5 = 15. No weekend multiplier. Cap = 150.
    client.post("/events", json=payload)
    
    balance_before = client.get("/users/user_rev/balance").json()["balance"]
    assert balance_before == 15
    
    # 2. Reverse event
    response = client.post("/reverse/evt_rev_01")
    assert response.status_code == 200
    data = response.json()
    assert data["is_reversed"] is True
    
    # 3. Verify balance is now 0
    balance_after = client.get("/users/user_rev/balance").json()["balance"]
    assert balance_after == 0
    
    # Check ledger contains CREDIT and REVERSAL
    ledger = db.query(LedgerEntry).filter(LedgerEntry.user_id == "user_rev").all()
    assert len(ledger) == 2
    assert ledger[0].entry_type == "CREDIT" and ledger[0].points == 15
    assert ledger[1].entry_type == "REVERSAL" and ledger[1].points == -15

def test_cannot_reverse_same_event_twice(client, db):
    # 1. Earn points
    payload = {
        "event_id": "evt_rev_twice",
        "user_id": "user_rev_t",
        "event_type": "referral",
        "amount": 0.0,
        "timestamp": "2026-06-17T10:30:00"
    }
    # Referral points = 50 fixed points.
    client.post("/events", json=payload)
    
    # 2. First reversal (success)
    resp1 = client.post("/reverse/evt_rev_twice")
    assert resp1.status_code == 200
    
    # 3. Second reversal (fails)
    resp2 = client.post("/reverse/evt_rev_twice")
    assert resp2.status_code == 400
    assert "already been reversed" in resp2.json()["detail"].lower()
    
    # Check balance remains 0 (50 - 50 = 0)
    balance = client.get("/users/user_rev_t/balance").json()["balance"]
    assert balance == 0

def test_unknown_event_type_returns_error(client):
    payload = {
        "event_id": "evt_unknown",
        "user_id": "user_err",
        "event_type": "invalid_type",
        "amount": 100.0,
        "timestamp": "2026-06-17T10:30:00"
    }
    response = client.post("/events", json=payload)
    # Pydantic field_validator should catch this and return 422 Unprocessable Entity
    assert response.status_code == 422

def test_reversal_allows_negative_balance(client, db):
    # 1. Ingest event to earn 40 points
    payload = {
        "event_id": "evt_neg_01",
        "user_id": "user_neg",
        "event_type": "deposit",
        "amount": 1000.0,
        "timestamp": "2026-06-20T10:30:00"  # Saturday, x2 multiplier => 40 points
    }
    client.post("/events", json=payload)
    
    # Add another 20 points
    payload2 = {
        "event_id": "evt_neg_02",
        "user_id": "user_neg",
        "event_type": "deposit",
        "amount": 1000.0,
        "timestamp": "2026-06-17T10:30:00"  # Wednesday, no multiplier => 20 points
    }
    client.post("/events", json=payload2)
    # Total = 60 points.
    
    # 2. Redeem Coffee Voucher (50 points)
    client.post("/redeem", json={"user_id": "user_neg", "reward_id": "coffee_voucher"})
    
    # Remaining balance should be 10 points
    balance_resp = client.get("/users/user_neg/balance").json()
    assert balance_resp["balance"] == 10
    
    # 3. Reverse the 40 points event (evt_neg_01)
    rev_resp = client.post("/reverse/evt_neg_01")
    assert rev_resp.status_code == 200
    
    # Balance should now be 10 - 40 = -30 points
    balance_resp = client.get("/users/user_neg/balance").json()
    assert balance_resp["balance"] == -30
    
    # Verify ledger entries
    ledger = db.query(LedgerEntry).filter(LedgerEntry.user_id == "user_neg").all()
    # Should have:
    # 1. CREDIT +40 (evt_neg_01)
    # 2. CREDIT +20 (evt_neg_02)
    # 3. DEBIT -50 (redemption)
    # 4. REVERSAL -40 (evt_neg_01 reversal)
    assert len(ledger) == 4
    types_and_points = [(le.entry_type, le.points) for le in ledger]
    assert ("CREDIT", 40) in types_and_points
    assert ("CREDIT", 20) in types_and_points
    assert ("DEBIT", -50) in types_and_points
    assert ("REVERSAL", -40) in types_and_points
