import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from .models import Event, LedgerEntry, Redemption
from .rules_engine import calculate_points
from .rewards import REWARDS_CATALOG

# Custom exceptions for business logic mapping
class InsufficientBalanceError(Exception):
    pass

class RewardNotFoundError(Exception):
    pass

class EventNotFoundError(Exception):
    pass

class EventAlreadyReversedError(Exception):
    pass

def get_user_balance(db: Session, user_id: str) -> int:
    """Calculates the user's loyalty balance by summing all ledger points."""
    balance = db.query(func.sum(LedgerEntry.points)).filter(LedgerEntry.user_id == user_id).scalar()
    return int(balance) if balance is not None else 0

def ingest_event(db: Session, event_data: dict) -> dict:
    """
    Ingests an event. Enforces database transaction and idempotency.
    If event_id already exists, returns duplicate status without modifying database.
    """
    event_id = event_data["event_id"]
    user_id = event_data["user_id"]
    event_type = event_data["event_type"]
    amount = event_data["amount"]
    timestamp = event_data["timestamp"]

    # Check for existing event (Idempotency)
    existing_event = db.query(Event).filter(Event.event_id == event_id).first()
    if existing_event:
        current_balance = get_user_balance(db, user_id)
        return {
            "status": "duplicate",
            "event": existing_event,
            "points_awarded": existing_event.points_awarded,
            "current_balance": current_balance
        }

    # Calculate points using rules engine
    points_awarded, rule_snapshot = calculate_points(event_type, amount, timestamp)

    # Database operation in a single transaction block
    try:
        new_event = Event(
            event_id=event_id,
            user_id=user_id,
            event_type=event_type,
            amount=amount,
            timestamp=timestamp,
            points_awarded=points_awarded,
            rule_snapshot=rule_snapshot,
            is_reversed=False
        )
        db.add(new_event)
        
        # Flush to check for any database-level constraints before writing ledger
        db.flush()

        # If points_awarded is 0 (like withdrawal), we still create a LedgerEntry of 0 points
        ledger_entry = LedgerEntry(
            user_id=user_id,
            reference_id=event_id,
            entry_type="CREDIT",
            points=points_awarded,
            description=f"Earned points from {event_type} event"
        )
        db.add(ledger_entry)
        
        # Commit both in a single transaction
        db.commit()
        db.refresh(new_event)
    except Exception as e:
        db.rollback()
        raise e

    current_balance = get_user_balance(db, user_id)
    return {
        "status": "processed",
        "event": new_event,
        "points_awarded": points_awarded,
        "current_balance": current_balance
    }

def redeem_reward(db: Session, user_id: str, reward_id: str) -> Redemption:
    """
    Redeems a reward from the catalog.
    Checks balance, inserts redemption and DEBIT ledger entry inside a transaction.
    """
    if reward_id not in REWARDS_CATALOG:
        raise RewardNotFoundError(f"Reward '{reward_id}' not found in catalog")

    reward = REWARDS_CATALOG[reward_id]
    points_cost = reward["cost"]

    # Calculate current balance
    current_balance = get_user_balance(db, user_id)
    if current_balance < points_cost:
        raise InsufficientBalanceError(
            f"User '{user_id}' has insufficient balance. Required: {points_cost}, Available: {current_balance}"
        )

    redemption_id = f"red_{uuid.uuid4().hex[:12]}"
    
    try:
        new_redemption = Redemption(
            redemption_id=redemption_id,
            user_id=user_id,
            reward_id=reward_id,
            reward_name=reward["name"],
            points_spent=points_cost
        )
        db.add(new_redemption)

        # Create compensating DEBIT ledger entry (negative points)
        ledger_entry = LedgerEntry(
            user_id=user_id,
            reference_id=redemption_id,
            entry_type="DEBIT",
            points=-points_cost,
            description=f"Redeemed {reward['name']}"
        )
        db.add(ledger_entry)

        db.commit()
        db.refresh(new_redemption)
    except Exception as e:
        db.rollback()
        raise e

    return new_redemption

def reverse_event(db: Session, event_id: str) -> Event:
    """
    Reverses an ingestion event.
    Creates a compensating REVERSAL ledger entry. Allows negative balance.
    """
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise EventNotFoundError(f"Event with ID '{event_id}' not found")

    if event.is_reversed:
        raise EventAlreadyReversedError(f"Event '{event_id}' has already been reversed")

    # In single transaction, mark event as reversed and add compensating entry
    try:
        event.is_reversed = True
        
        reversal_points = -event.points_awarded
        ledger_entry = LedgerEntry(
            user_id=event.user_id,
            reference_id=event.event_id,
            entry_type="REVERSAL",
            points=reversal_points,
            description=f"Reversal of event '{event_id}' (originally {event.points_awarded} points)"
        )
        db.add(ledger_entry)
        db.commit()
        db.refresh(event)
    except Exception as e:
        db.rollback()
        raise e

    return event

def get_stats(db: Session) -> dict:
    """
    Returns dashboard statistics:
    - total_events: count of all ingested events
    - total_ledger_entries: count of all ledger records
    - total_points_issued: sum of points awarded by CREDIT entries (only positive credits)
    - total_redemptions: count of all redemption actions
    """
    total_events = db.query(Event).count()
    total_ledger_entries = db.query(LedgerEntry).count()
    
    # Sum of all positive CREDIT entries
    points_issued = db.query(func.sum(LedgerEntry.points)).filter(LedgerEntry.entry_type == "CREDIT").scalar()
    total_points_issued = int(points_issued) if points_issued is not None else 0
    
    total_redemptions = db.query(Redemption).count()
    
    return {
        "total_events": total_events,
        "total_ledger_entries": total_ledger_entries,
        "total_points_issued": total_points_issued,
        "total_redemptions": total_redemptions
    }
