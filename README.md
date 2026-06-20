# Loyalty Points Engine

This project is a loyalty points backend with a small React dashboard. The backend handles event ingestion, point calculation, ledger entries, redemption, and reversal. The frontend is included only to make testing and demonstration easier.

---

## Technical Stack

### Backend
- **Python 3.10+**
- **FastAPI** (Web framework for handling requests)
- **SQLite** (Database)
- **SQLAlchemy** (ORM for database operations)
- **Pydantic** (Data validation and schemas)
- **pytest** & **httpx** (Testing setup)

### Frontend
- **React 19** & **TypeScript**
- **Vite** (Build tool)
- **Tailwind CSS** (Styling library)
- **Axios** (HTTP client)

---

## Folder Structure

```
loyalty-points-engine/
│
├── backend/
│   ├── app/
│   │   ├── main.py            # API routing and entry point
│   │   ├── database.py        # Database setup and session creation
│   │   ├── models.py          # SQLAlchemy models (Event, LedgerEntry, Redemption)
│   │   ├── schemas.py         # Pydantic validation schemas
│   │   ├── rules_engine.py    # Points calculation logic
│   │   ├── rewards.py         # Rewards catalog list
│   │   ├── services.py        # Core database transactions & operation functions
│   │   ├── config/
│   │   │   └── rules.json     # JSON config file for point scoring rules
│   │   └── tests/
│   │       └── test_core.py   # pytest file using isolated test database
│   ├── requirements.txt
│   └── README_BACKEND.md
│
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts      # Axios API client setup (base url: http://localhost:8000)
│   │   ├── App.tsx            # Main dashboard component
│   │   ├── main.tsx           # React bootstrap entry point
│   │   └── index.css          # Tailwind CSS global styles
│   ├── package.json
│   └── README_FRONTEND.md
│
├── README.md                  # Project overview & running instructions (this file)
└── AI_USAGE_WRITEUP.md        # AI disclosure document
```

---

## Quick Start Setup

### Run Backend
1. Navigate to the backend directory, initialize a virtual environment, and activate it:
   - **On Windows (PowerShell)**:
     ```powershell
     cd backend
     python -m venv venv
     venv\Scripts\activate
     ```
   - **On macOS / Linux**:
     ```bash
     cd backend
     python -m venv venv
     source venv/bin/activate
     ```
2. Install the backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the local server:
   ```bash
   uvicorn app.main:app --reload
   ```
The backend server runs at `http://localhost:8000`. You can access the interactive Swagger documentation at `http://localhost:8000/docs`.

### Run Frontend
1. Open a new terminal window, navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
The dashboard runs at `http://localhost:5173`.

#### Default frontend behavior:
* The frontend calls the backend at `http://localhost:8000`

If port 8000 is blocked and backend is running on another port such as 8001:
1. Create a `.env` file inside the frontend folder
2. Add:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8001
   ```
3. Restart the frontend using:
   ```bash
   npm run dev
   ```

### Run Automated Tests
Execute the pytest suite using the active Python virtual environment in the `backend` directory:
```bash
cd backend
pytest
```

---

## Core Logic Designs

### 1. Idempotency handling
Each event must contain a unique `event_id`. When a request comes in, the backend checks if the `event_id` exists in the database first.
- If the event exists, the API returns `200 OK` with `status: "duplicate"` along with the previously saved event details and user balance. It does not write to the ledger again.
- If it does not exist, it runs the points calculation and saves both the Event and Ledger entry inside a single database transaction.

### 2. Configurable Rules
Points are calculated dynamically based on values configured in `backend/app/config/rules.json`.
- Rules support base units points division (e.g. 1 point per $100 spent), flat points (e.g. 50 points per referral), fixed bonuses (e.g. 10 bonus points on deposits), and caps (maximum points allowed on a single event).
- Weekend multiplier: If the event's timestamp is a Saturday or Sunday, points are multiplied by the multiplier (e.g., x2), up to the event's configured maximum cap.

### 3. Points Ledger
To maintain an audit log, the user's balance is never saved or updated in a single column.
- Every transaction writes a new row into the `LedgerEntry` table with `entry_type` as `CREDIT` (earning points), `DEBIT` (redemption), or `REVERSAL` (compensation adjustment).
- To compute a user's current points balance, the database sums the points of all ledger entries for that user. Old records are never edited or deleted.

### 4. Event Reversals
If an event needs to be reversed, the API inserts a compensating `REVERSAL` ledger entry carrying negative points equivalent to the original event points. The original event is marked `is_reversed = true` so it cannot be reversed multiple times.
- **Negative Balance Assumption**: If a user has already redeemed points and has insufficient balance to cover a subsequent event reversal, **the reversal is still allowed**. The user's balance will drop below zero. This is done to make sure the ledger history remains correct.

---

## API Endpoints List

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| **POST** | `/events` | Ingests a new event. Checks idempotency. |
| **GET** | `/events` | Lists all ingested events. |
| **GET** | `/events/{event_id}` | Retrieves a single event by ID. |
| **POST** | `/redeem` | Redeems a reward for a user if balance is sufficient. |
| **POST** | `/reverse/{event_id}` | Reverses an ingested event, adding compensating ledger points. |
| **GET** | `/users/{user_id}/balance` | Returns the current summed balance of a user. |
| **GET** | `/users/{user_id}/ledger` | Returns all ledger entries for a user, latest first. |
| **GET** | `/rewards` | Returns the active rewards catalogue. |
| **GET** | `/rules` | Exposes current scoring configuration rules. |
| **GET** | `/stats` | Exposes aggregate database statistics. |
| **GET** | `/health` | Simple service availability check. |

---

## curl Examples

Use these command line instructions to test the API operations.

### 1. Idempotency Example
First, send an event `evt_001` for `user_123`:
```bash
curl -X POST http://localhost:8000/events ^
-H "Content-Type: application/json" ^
-d "{\"event_id\":\"evt_001\",\"user_id\":\"user_123\",\"event_type\":\"deposit\",\"amount\":1000,\"timestamp\":\"2026-06-20T10:30:00\"}"
```
**Expected Output (Calculated points: 20 base + weekend x2 = 40):**
```json
{
  "status": "processed",
  "event": {
    "id": 1,
    "event_id": "evt_001",
    "user_id": "user_123",
    "event_type": "deposit",
    "amount": 1000.0,
    "timestamp": "2026-06-20T10:30:00",
    "points_awarded": 40,
    "is_reversed": false
  },
  "points_awarded": 40,
  "current_balance": 40
}
```

Now, submit the exact same event again:
```bash
curl -X POST http://localhost:8000/events ^
-H "Content-Type: application/json" ^
-d "{\"event_id\":\"evt_001\",\"user_id\":\"user_123\",\"event_type\":\"deposit\",\"amount\":1000,\"timestamp\":\"2026-06-20T10:30:00\"}"
```
**Expected Output (Idempotency triggered):**
```json
{
  "status": "duplicate",
  "event": {
    "id": 1,
    "event_id": "evt_001",
    "user_id": "user_123",
    "event_type": "deposit",
    "amount": 1000.0,
    "timestamp": "2026-06-20T10:30:00",
    "points_awarded": 40,
    "is_reversed": false
  },
  "points_awarded": 40,
  "current_balance": 40
}
```
*Note: Notice how `current_balance` remains `40`. The duplicate request did not modify the database or award points twice.*

### 2. Balance Check
Check the balance of `user_123`:
```bash
curl http://localhost:8000/users/user_123/balance
```
**Expected Output:**
```json
{"user_id":"user_123","balance":40}
```

### 3. Insufficient Balance Redemption Example
Attempt to redeem a Movie Ticket (costs 120 points) for `user_123` who only has 40 points:
```bash
curl -X POST http://localhost:8000/redeem ^
-H "Content-Type: application/json" ^
-d "{\"user_id\":\"user_123\",\"reward_id\":\"movie_ticket\"}"
```
**Expected Output (HTTP 400 Bad Request):**
```json
{
  "detail": "User 'user_123' has insufficient balance. Required: 120, Available: 40"
}
```
*Note: Verify that the ledger does not contain any debit records from this failed attempt.*

### 4. Successful Redemption Example
Now, earn enough points by depositing $2000 on a weekday (Wednesday):
```bash
curl -X POST http://localhost:8000/events ^
-H "Content-Type: application/json" ^
-d "{\"event_id\":\"evt_002\",\"user_id\":\"user_123\",\"event_type\":\"deposit\",\"amount\":2000,\"timestamp\":\"2026-06-17T10:30:00\"}"
```
*Note: $2000 / 100 = 20 units. 20 * 1 = 20 points. 20 + 10 base_bonus = 30 points. New balance: 40 + 30 = 70 points.*

Redeem a Coffee Voucher (costs 50 points):
```bash
curl -X POST http://localhost:8000/redeem ^
-H "Content-Type: application/json" ^
-d "{\"user_id\":\"user_123\",\"reward_id\":\"coffee_voucher\"}"
```
**Expected Output:**
```json
{
  "redemption_id": "red_c32a76f25974",
  "user_id": "user_123",
  "reward_id": "coffee_voucher",
  "reward_name": "Coffee Voucher",
  "points_spent": 50,
  "remaining_balance": 20,
  "created_at": "2026-06-20T21:47:24"
}
```

### 5. Reversal Example
Now, reverse the original Saturday event `evt_001` (which awarded 40 points). Note that the user has a balance of 20 points, so this will drive the balance negative:
```bash
curl -X POST http://localhost:8000/reverse/evt_001
```
**Expected Output (HTTP 200 OK):**
```json
{
  "id": 1,
  "event_id": "evt_001",
  "user_id": "user_123",
  "event_type": "deposit",
  "amount": 1000.0,
  "timestamp": "2026-06-20T10:30:00",
  "points_awarded": 40,
  "is_reversed": true
}
```

Check the user's ledger history to verify that the original records were not deleted or modified, but rather a compensating REVERSAL entry was appended:
```bash
curl http://localhost:8000/users/user_123/ledger
```
**Expected Output:**
```json
[
  {
    "id": 4,
    "user_id": "user_123",
    "reference_id": "evt_001",
    "entry_type": "REVERSAL",
    "points": -40,
    "description": "Reversal of event 'evt_001' (originally 40 points)",
    "created_at": "2026-06-20T21:47:50"
  },
  {
    "id": 3,
    "user_id": "user_123",
    "reference_id": "red_c32a76f25974",
    "entry_type": "DEBIT",
    "points": -50,
    "description": "Redeemed Coffee Voucher",
    "created_at": "2026-06-20T21:47:35"
  },
  {
    "id": 2,
    "user_id": "user_123",
    "reference_id": "evt_002",
    "entry_type": "CREDIT",
    "points": 30,
    "description": "Earned points from deposit event",
    "created_at": "2026-06-20T21:47:30"
  },
  {
    "id": 1,
    "user_id": "user_123",
    "reference_id": "evt_001",
    "entry_type": "CREDIT",
    "points": 40,
    "description": "Earned points from deposit event",
    "created_at": "2026-06-20T21:47:24"
  }
]
```

Check the final balance of `user_123` (40 credit + 30 credit - 50 debit - 40 reversal = -20):
```bash
curl http://localhost:8000/users/user_123/balance
```
**Expected Output:**
```json
{"user_id":"user_123","balance":-20}
```
*Note: This shows that the balance can drop below zero following an audit correction, preserving correct system auditing.*

---

## AI Usage Disclosure
AI tools were used to assist with the initial setup, boilerplate structure, edge-case checks, and drafting the README. Details are recorded in `AI_USAGE_WRITEUP.md`.
