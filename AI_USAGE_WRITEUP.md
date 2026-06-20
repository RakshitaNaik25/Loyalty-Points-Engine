# AI Usage Write-up

This project was developed with assistance from AI tools, which were utilized to scaffold the initial project structure, generate database and API boilerplate code, inspect edge cases, and draft initial documentation.

However, all key architectural and design decisions were reviewed and finalized manually:
1. **Immutable Ledger**: An immutable ledger design was selected instead of updating a simple balance column to ensure absolute auditability and historical traceability.
2. **Configurable Rules**: Scoring configurations were stored in a configurable JSON file rather than hardcoded using complex application statements, enabling easy updates.
3. **Idempotency Guarantee**: Idempotency was enforced by leveraging unique event ID constraint validation at both the database and routing layers.

AI outputs were corrected and customized where necessary. For instance, code suggesting direct balance column modifications was replaced with transaction-safe ledger inserts, and reversals were rewritten to write compensating ledger entries rather than deleting records. Additionally, reversals were explicitly permitted to push user balances below zero to maintain audit trail correctness, overriding standard balance validation routines.
