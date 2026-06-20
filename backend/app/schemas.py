from datetime import datetime
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict

class EventCreate(BaseModel):
    event_id: str = Field(..., min_length=1, description="Unique event identifier")
    user_id: str = Field(..., min_length=1, description="User identifier")
    event_type: str = Field(..., description="Type of event: deposit, purchase, referral, withdrawal")
    amount: float = Field(..., ge=0, description="Amount associated with the event")
    timestamp: datetime = Field(..., description="Timestamp of the event in ISO format")

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        allowed = {"deposit", "purchase", "referral", "withdrawal"}
        if v not in allowed:
            raise ValueError(f"event_type must be one of {allowed}")
        return v

class EventResponse(BaseModel):
    id: int
    event_id: str
    user_id: str
    event_type: str
    amount: float
    timestamp: datetime
    points_awarded: int
    rule_snapshot: Optional[Dict[str, Any]] = None
    is_reversed: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class EventIngestionResult(BaseModel):
    status: str  # "processed" or "duplicate"
    event: EventResponse
    points_awarded: int
    current_balance: int

class RedeemRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    reward_id: str = Field(..., min_length=1)

class RedeemResponse(BaseModel):
    redemption_id: str
    user_id: str
    reward_id: str
    reward_name: str
    points_spent: int
    remaining_balance: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class BalanceResponse(BaseModel):
    user_id: str
    balance: int

class LedgerEntryResponse(BaseModel):
    id: int
    user_id: str
    reference_id: str
    entry_type: str
    points: int
    description: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class StatsResponse(BaseModel):
    total_events: int
    total_ledger_entries: int
    total_points_issued: int
    total_redemptions: int

class RewardItem(BaseModel):
    reward_id: str
    name: str
    cost: int

class RuleConfig(BaseModel):
    points_per_unit: Optional[int] = None
    unit_amount: Optional[int] = None
    base_bonus: Optional[int] = None
    fixed_points: Optional[int] = None
    cap: int

class RulesResponse(BaseModel):
    event_rules: Dict[str, RuleConfig]
    bonus_rules: Dict[str, Any]
