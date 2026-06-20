import json
import os
from datetime import datetime
from typing import Dict, Any, Tuple

RULES_FILE_PATH = os.path.join(os.path.dirname(__file__), "config", "rules.json")

def load_rules() -> Dict[str, Any]:
    """Loads rules.json dynamically from the config directory."""
    if not os.path.exists(RULES_FILE_PATH):
        raise FileNotFoundError(f"Rules configuration file not found at {RULES_FILE_PATH}")
    with open(RULES_FILE_PATH, "r") as f:
        return json.load(f)

def calculate_points(event_type: str, amount: float, timestamp: datetime) -> Tuple[int, Dict[str, Any]]:
    """
    Calculates loyalty points based on event type, amount, and timestamp.
    Returns:
        (points_awarded, rule_snapshot_dict)
    """
    rules = load_rules()
    event_rules = rules.get("event_rules", {})
    bonus_rules = rules.get("bonus_rules", {})

    if event_type not in event_rules:
        raise ValueError(f"Unknown event type: {event_type}")

    rule = event_rules[event_type]
    cap = rule.get("cap", 0)
    
    # Calculate base points
    base_points = 0
    calculation_steps = []
    
    if "fixed_points" in rule:
        base_points = rule["fixed_points"]
        calculation_steps.append(f"Fixed points: {base_points}")
    else:
        unit_amount = rule.get("unit_amount", 100)
        points_per_unit = rule.get("points_per_unit", 0)
        base_bonus = rule.get("base_bonus", 0)
        
        # Calculate units
        units = int(amount // unit_amount) if unit_amount > 0 else 0
        points_from_units = units * points_per_unit
        base_points = points_from_units + base_bonus
        
        calculation_steps.append(
            f"Units: {units} (amount: {amount} / unit_amount: {unit_amount}) * points_per_unit: {points_per_unit} = {points_from_units}"
        )
        calculation_steps.append(f"Base bonus: {base_bonus}")
        calculation_steps.append(f"Base points total: {base_points}")

    # Check weekend multiplier
    is_weekend = timestamp.weekday() in (5, 6)  # 5 = Saturday, 6 = Sunday
    multiplier_applied = False
    multiplier_value = 1
    
    weekend_rule = bonus_rules.get("weekend_multiplier", {})
    if is_weekend and weekend_rule.get("enabled", False):
        multiplier_value = weekend_rule.get("multiplier", 1)
        base_points = int(base_points * multiplier_value)
        multiplier_applied = True
        calculation_steps.append(f"Weekend multiplier applied: x{multiplier_value}")

    # Apply cap
    final_points = base_points
    cap_applied = False
    if final_points > cap:
        final_points = cap
        cap_applied = True
        calculation_steps.append(f"Cap applied: capped at {cap} (was {base_points})")
    else:
        calculation_steps.append(f"Final points: {final_points} (below cap: {cap})")

    rule_snapshot = {
        "applied_rule": rule,
        "weekend_multiplier_enabled": weekend_rule.get("enabled", False),
        "is_weekend": is_weekend,
        "multiplier_applied": multiplier_applied,
        "multiplier_value": multiplier_value,
        "cap": cap,
        "cap_applied": cap_applied,
        "calculation_steps": calculation_steps
    }

    return final_points, rule_snapshot
