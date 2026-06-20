# AI Usage Write-up

I used AI tools such as Claude and ChatGPT while building this project, mainly to get a starting structure, generate basic FastAPI and React setup code, and check important edge cases like duplicate events, insufficient balance, and reversals. I also used AI help for improving the README and test ideas. After that, I reviewed the code and made changes based on the assignment requirements.

The main design decisions were made by me. I chose to use a ledger instead of only storing a balance because a ledger keeps the full history of points earned, spent, and reversed. This makes it easier to understand how a user got their current balance. I also kept the point rules in a JSON file so that rules like base points, bonus, multiplier, and cap can be changed without editing the main backend logic.

One place where I had to correct the AI output was the balance and reversal logic. Some suggestions were based on directly updating a user balance or changing old records. I changed this so every action creates a new ledger entry. For reversal, the original event is not deleted. Instead, a negative ledger entry is added to cancel the earlier points.
