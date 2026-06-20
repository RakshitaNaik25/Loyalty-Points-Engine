from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from .database import engine, Base, get_db
from .models import Event, LedgerEntry, Redemption
from .rewards import REWARDS_CATALOG
from .rules_engine import load_rules
from . import schemas, services

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Loyalty Points Engine API")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "message": "Loyalty Points Engine API is running",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", response_model=Dict[str, str])
def health_check():
    """Simple API status check."""
    return {"status": "healthy"}

@app.post("/events", response_model=schemas.EventIngestionResult)
def ingest_event(event_req: schemas.EventCreate, db: Session = Depends(get_db)):
    """
    Ingests an event. Checks idempotency. If duplicate event_id is supplied,
    returns status duplicate without processing again.
    """
    try:
        result = services.ingest_event(db, event_req.model_dump())
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database or system error processing event: {str(e)}"
        )

@app.get("/events", response_model=List[schemas.EventResponse])
def list_events(db: Session = Depends(get_db)):
    """Lists all events in the system, latest first."""
    events = db.query(Event).order_by(Event.created_at.desc()).all()
    return events

@app.get("/events/{event_id}", response_model=schemas.EventResponse)
def get_event(event_id: str, db: Session = Depends(get_db)):
    """Retrieves a single event by event_id."""
    event = db.query(Event).filter(Event.event_id == event_id).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event with ID '{event_id}' not found"
        )
    return event

@app.post("/redeem", response_model=schemas.RedeemResponse)
def redeem_reward(req: schemas.RedeemRequest, db: Session = Depends(get_db)):
    """Redeems a reward for a user if balance is sufficient."""
    try:
        redemption = services.redeem_reward(db, req.user_id, req.reward_id)
        remaining_balance = services.get_user_balance(db, req.user_id)
        return {
            "redemption_id": redemption.redemption_id,
            "user_id": redemption.user_id,
            "reward_id": redemption.reward_id,
            "reward_name": redemption.reward_name,
            "points_spent": redemption.points_spent,
            "remaining_balance": remaining_balance,
            "created_at": redemption.created_at
        }
    except services.RewardNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except services.InsufficientBalanceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing redemption: {str(e)}"
        )

@app.post("/reverse/{event_id}", response_model=schemas.EventResponse)
def reverse_event(event_id: str, db: Session = Depends(get_db)):
    """Reverses an earning event and deducts points via compensating ledger entry."""
    try:
        reversed_event = services.reverse_event(db, event_id)
        return reversed_event
    except services.EventNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except services.EventAlreadyReversedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reversing event: {str(e)}"
        )

@app.get("/users/{user_id}/balance", response_model=schemas.BalanceResponse)
def get_user_balance(user_id: str, db: Session = Depends(get_db)):
    """Returns the total loyalty point balance for a user."""
    balance = services.get_user_balance(db, user_id)
    return {"user_id": user_id, "balance": balance}

@app.get("/users/{user_id}/ledger", response_model=List[schemas.LedgerEntryResponse])
def get_user_ledger(user_id: str, db: Session = Depends(get_db)):
    """Returns all ledger entries for a user, sorted latest first."""
    entries = db.query(LedgerEntry).filter(LedgerEntry.user_id == user_id).order_by(LedgerEntry.created_at.desc()).all()
    return entries

@app.get("/rewards", response_model=List[schemas.RewardItem])
def get_rewards():
    """Returns the available rewards catalogue."""
    return list(REWARDS_CATALOG.values())

@app.get("/rules", response_model=schemas.RulesResponse)
def get_rules():
    """Returns the points configuration rules from rules.json."""
    try:
        rules_data = load_rules()
        return rules_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not load rules: {str(e)}"
        )

@app.get("/stats", response_model=schemas.StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """Returns statistics summary for the admin dashboard."""
    try:
        return services.get_stats(db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not load stats: {str(e)}"
        )
