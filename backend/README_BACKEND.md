# Loyalty Points Engine Backend

This is the backend for the **Loyalty Points Engine**, built using Python, FastAPI, SQLite, SQLAlchemy, and Pydantic.

## Tech Stack
- **Python 3.10+**
- **FastAPI** (API routing and middleware)
- **SQLite** (Relational Database)
- **SQLAlchemy** (ORM)
- **Pydantic** (Data validation & serialization)
- **pytest** (Testing framework)

## Setup & Running

### 1. Create a Virtual Environment
Navigate to the `backend` folder and initialize a virtual environment:
```bash
cd backend
python -m venv venv
```

### 2. Activate the Virtual Environment
- **Windows (PowerShell)**:
  ```powershell
  venv\Scripts\activate
  ```
- **macOS / Linux**:
  ```bash
  source venv/bin/activate
  ```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the API Server
Start the development server using Uvicorn:
```bash
uvicorn app.main:app --reload
```
The server will run at `http://localhost:8000`. You can inspect the interactive Swagger API documentation at `http://localhost:8000/docs`.

### 5. Run Tests
The test suite utilizes a separate, temporary SQLite database (`test_loyalty.db`) to ensure tests do not pollute local development data:
```bash
pytest
```
All test cases run automatically and delete the test database file on completion.

## Key Features

1. **Idempotent Ingestion**: Handles repeated event requests with the same `event_id` gracefully by returning a duplicate status rather than re-awarding points or generating duplicate ledger logs.
2. **Immutable Ledger**: Avoids basic balance updates. Every points addition, redemption, and reversal creates a distinct, unmodifiable record in the `LedgerEntry` table. User balances are calculated at runtime by summing all points.
3. **Transaction Safety**: Creation of `Event` and its associated `LedgerEntry` occurs within a single database transaction context. If any step fails, the entire transaction is rolled back.
4. **Configurable Rules**: Load and evaluate loyalty logic dynamically from `app/config/rules.json`.
5. **Audit Reversals**: Allows reversing events, which inserts a negative points ledger entry. The balance is permitted to go negative in this scenario because it serves as an audit correction.
