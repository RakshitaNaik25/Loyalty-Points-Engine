# Loyalty Points Engine Frontend

This is a clean, modern administrative dashboard for the **Loyalty Points Engine**, built using React, Vite, TypeScript, Tailwind CSS, and Axios.

## Tech Stack
- **React 19**
- **Vite** (Build tool & dev server)
- **TypeScript**
- **Tailwind CSS** (Styling)
- **Axios** (API communication)

## Setup & Running

### 1. Install Dependencies
Navigate to the `frontend` folder and install packages:
```bash
cd frontend
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```
The application will boot at `http://localhost:5173`. Open this URL in your web browser to access the dashboard.

### 3. Custom Backend Port Configuration (Optional)
By default, the frontend calls the backend API at `http://localhost:8000`.

If port 8000 is blocked and your backend is running on another port (such as `8001`):
1. Create a `.env` file inside the `frontend/` folder.
2. Add:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8001
   ```
3. Restart the frontend server using:
   ```bash
   npm run dev
   ```

## Dashboard Components

- **Overview Panel**: Displays aggregate system statistics (total events ingested, total ledger records, total points issued, and total redemptions) along with a backend health indicator.
- **Event Ingestor Form**: Allows submitting deposit, purchase, referral, and withdrawal events. Includes a **Submit Same Event Again** button that preserves the payload parameters (including the unique `event_id`) to test backend idempotency.
- **User Dashboard**: Displays the selected user's live balance (calculated by summing their ledger entries) and shows their complete transaction ledger history in a table. Offers buttons to redeem rewards from the rewards catalog.
- **Audit Reversals**: A secure tool to reverse any specific earning event by entering its `event_id`. Adds a compensating negative ledger entry to correct the balance.
- **Rules Viewer**: Displays the live backend point scoring criteria, caps, and weekend multipliers loaded from `rules.json`.
