import React, { useState, useEffect } from "react";
import apiClient from "./api/client";

// Define Interfaces
interface EventResponse {
  id: number;
  event_id: string;
  user_id: string;
  event_type: string;
  amount: number;
  timestamp: string;
  points_awarded: number;
  rule_snapshot: any;
  is_reversed: boolean;
  created_at: string;
}

interface IngestionResult {
  status: "processed" | "duplicate";
  event: EventResponse;
  points_awarded: number;
  current_balance: number;
}

interface LedgerEntry {
  id: number;
  user_id: string;
  reference_id: string;
  entry_type: "CREDIT" | "DEBIT" | "REVERSAL" | string;
  points: number;
  description: string;
  created_at: string;
}

interface Reward {
  reward_id: string;
  name: string;
  cost: number;
}

interface RuleConfig {
  points_per_unit?: number;
  unit_amount?: number;
  base_bonus?: number;
  fixed_points?: number;
  cap: number;
}

interface RulesData {
  event_rules: Record<string, RuleConfig>;
  bonus_rules: {
    weekend_multiplier?: {
      enabled: boolean;
      multiplier: number;
    };
  };
}

interface DashboardStats {
  total_events: number;
  total_ledger_entries: number;
  total_points_issued: number;
  total_redemptions: number;
}

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"overview" | "events" | "users" | "reversals" | "rules">("overview");

  // Global Context / Shared State
  const [activeUserId, setActiveUserId] = useState<string>("user_123");
  const [backendHealth, setBackendHealth] = useState<"healthy" | "unhealthy" | "checking">("checking");
  const [stats, setStats] = useState<DashboardStats>({
    total_events: 0,
    total_ledger_entries: 0,
    total_points_issued: 0,
    total_redemptions: 0,
  });

  // Event Ingestion Form State
  const [ingestEventId, setIngestEventId] = useState<string>("");
  const [ingestUserId, setIngestUserId] = useState<string>("user_123");
  const [ingestType, setIngestType] = useState<string>("deposit");
  const [ingestAmount, setIngestAmount] = useState<number>(1000);
  const [ingestTimestamp, setIngestTimestamp] = useState<string>("");
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState<any>(null);
  const [ingestResponse, setIngestResponse] = useState<IngestionResult | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestLoading, setIngestLoading] = useState<boolean>(false);

  // User Accounts State
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [userLedger, setUserLedger] = useState<LedgerEntry[]>([]);
  const [userLoading, setUserLoading] = useState<boolean>(false);
  const [userError, setUserError] = useState<string | null>(null);

  // Rewards catalog & redemption
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptionMessage, setRedemptionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [redemptionLoading, setRedemptionLoading] = useState<string | null>(null); // reward_id being redeemed

  // Reversals
  const [reverseEventId, setReverseEventId] = useState<string>("");
  const [reversalResult, setReversalResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [reversalLoading, setReversalLoading] = useState<boolean>(false);

  // Rules Config
  const [rules, setRules] = useState<RulesData | null>(null);
  const [rulesLoading, setRulesLoading] = useState<boolean>(false);

  // Helper to generate a unique event ID
  const generateNewEventId = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setIngestEventId(`evt_${randomNum}`);
  };

  // Check Backend Health & Load Stats
  const fetchHealthAndStats = async () => {
    try {
      const healthRes = await apiClient.get("/health");
      if (healthRes.data.status === "healthy") {
        setBackendHealth("healthy");
      } else {
        setBackendHealth("unhealthy");
      }
    } catch {
      setBackendHealth("unhealthy");
    }

    try {
      const statsRes = await apiClient.get("/stats");
      setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load stats", err);
    }
  };

  // Fetch User Balance & Ledger
  const fetchUserAccountData = async (userId: string) => {
    if (!userId.trim()) return;
    setUserLoading(true);
    setUserError(null);
    try {
      const balanceRes = await apiClient.get(`/users/${userId}/balance`);
      setUserBalance(balanceRes.data.balance);

      const ledgerRes = await apiClient.get(`/users/${userId}/ledger`);
      setUserLedger(ledgerRes.data);
    } catch (err: any) {
      setUserError(err.response?.data?.detail || "Failed to fetch user data.");
      setUserBalance(null);
      setUserLedger([]);
    } finally {
      setUserLoading(false);
    }
  };

  // Fetch rewards catalog
  const fetchRewards = async () => {
    try {
      const res = await apiClient.get("/rewards");
      setRewards(res.data);
    } catch (err) {
      console.error("Failed to load rewards catalog", err);
    }
  };

  // Fetch rules
  const fetchRules = async () => {
    setRulesLoading(true);
    try {
      const res = await apiClient.get("/rules");
      setRules(res.data);
    } catch (err) {
      console.error("Failed to load rules", err);
    } finally {
      setRulesLoading(false);
    }
  };

  // Initial Load
  useEffect(() => {
    fetchHealthAndStats();
    fetchRewards();
    fetchRules();
    generateNewEventId();
    
    // Set timestamp to now
    const now = new Date();
    // format as YYYY-MM-DDTHH:MM:SS
    const formatted = now.toISOString().slice(0, 19);
    setIngestTimestamp(formatted);
  }, []);

  // Fetch user data when active user changes
  useEffect(() => {
    fetchUserAccountData(activeUserId);
  }, [activeUserId]);

  // Submit Event Ingestion
  const handleIngestEvent = async (payloadOverride?: any) => {
    setIngestLoading(true);
    setIngestError(null);
    setIngestResponse(null);

    const payload = payloadOverride || {
      event_id: ingestEventId,
      user_id: ingestUserId,
      event_type: ingestType,
      amount: Number(ingestAmount),
      timestamp: ingestTimestamp,
    };

    try {
      const res = await apiClient.post("/events", payload);
      setIngestResponse(res.data);
      setLastSubmittedPayload(payload);
      
      // Sync active user if matching
      if (payload.user_id === activeUserId) {
        fetchUserAccountData(activeUserId);
      }
      // Refresh stats
      fetchHealthAndStats();
      
      // Auto generate next event ID for standard form path
      if (!payloadOverride) {
        generateNewEventId();
      }
    } catch (err: any) {
      setIngestError(err.response?.data?.detail || "Failed to submit event.");
    } finally {
      setIngestLoading(false);
    }
  };

  // Redeem Reward
  const handleRedeem = async (rewardId: string) => {
    setRedemptionMessage(null);
    setRedemptionLoading(rewardId);
    try {
      const res = await apiClient.post("/redeem", {
        user_id: activeUserId,
        reward_id: rewardId,
      });
      setRedemptionMessage({
        type: "success",
        text: `Successfully redeemed ${res.data.reward_name} for ${res.data.points_spent} points!`,
      });
      // Refresh user account
      fetchUserAccountData(activeUserId);
      // Refresh stats
      fetchHealthAndStats();
    } catch (err: any) {
      setRedemptionMessage({
        type: "error",
        text: err.response?.data?.detail || "Redemption failed.",
      });
    } finally {
      setRedemptionLoading(null);
    }
  };

  // Reverse Event
  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseEventId.trim()) return;
    setReversalLoading(true);
    setReversalResult(null);

    try {
      const res = await apiClient.post(`/reverse/${reverseEventId}`);
      setReversalResult({
        type: "success",
        text: `Event ${res.data.event_id} reversed successfully! Compensation entry added.`,
      });
      // Refresh active user account in case they were impacted
      fetchUserAccountData(activeUserId);
      // Refresh stats
      fetchHealthAndStats();
      setReverseEventId("");
    } catch (err: any) {
      setReversalResult({
        type: "error",
        text: err.response?.data?.detail || "Reversal failed.",
      });
    } finally {
      setReversalLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-none">Loyalty Points</h1>
              <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider">Engine</span>
            </div>
          </div>
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "overview"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
              </svg>
              <span>Overview</span>
            </button>
            <button
              onClick={() => setActiveTab("events")}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "events"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>Ingest Event</span>
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "users"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>User Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab("reversals")}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "reversals"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
              </svg>
              <span>Audit Reversals</span>
            </button>
            <button
              onClick={() => setActiveTab("rules")}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === "rules"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span>Rules Config</span>
            </button>
          </nav>
        </div>

        {/* User context selector */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Active User Context</label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={activeUserId}
              onChange={(e) => setActiveUserId(e.target.value)}
              className="bg-slate-900 text-white border border-slate-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-500 w-full"
              placeholder="Enter User ID"
            />
            <button
              onClick={() => fetchUserAccountData(activeUserId)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded px-2 py-1 text-sm transition"
              title="Sync Account"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-900">
        {/* Header bar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-950/50 shrink-0">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">
            {activeTab === "overview" && "Dashboard Overview"}
            {activeTab === "events" && "Event Ingestion Engine"}
            {activeTab === "users" && "User Loyalty Dashboard"}
            {activeTab === "reversals" && "Reversal Control Center"}
            {activeTab === "rules" && "Engine Rules Configuration"}
          </h2>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={fetchHealthAndStats}
              className="text-slate-400 hover:text-white p-2 transition rounded hover:bg-slate-800"
              title="Sync Stats"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.2" />
              </svg>
            </button>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">API Health:</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                backendHealth === "healthy"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : backendHealth === "unhealthy"
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}>
                {backendHealth}
              </span>
            </div>
          </div>
        </header>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-8 max-w-6xl">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-lg">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 font-semibold uppercase text-xs tracking-wider">Total Events Ingested</span>
                    <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-4 text-3xl font-extrabold text-white">{stats.total_events}</div>
                </div>
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-lg">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 font-semibold uppercase text-xs tracking-wider">Total Ledger Entries</span>
                    <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-4 text-3xl font-extrabold text-white">{stats.total_ledger_entries}</div>
                </div>
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-lg">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 font-semibold uppercase text-xs tracking-wider">Total Points Issued</span>
                    <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-4 text-3xl font-extrabold text-emerald-400">{stats.total_points_issued}</div>
                </div>
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-lg">
                  <div className="flex justify-between items-start">
                    <span className="text-slate-500 font-semibold uppercase text-xs tracking-wider">Total Redemptions</span>
                    <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-4 text-3xl font-extrabold text-white">{stats.total_redemptions}</div>
                </div>
              </div>

              {/* Informative description & quick setup card */}
              <div className="bg-slate-950 p-8 rounded-2xl border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-xl font-bold text-white">System Architecture Overview</h3>
                <p className="text-slate-400 leading-relaxed max-w-4xl">
                  The <strong className="font-semibold text-white">Loyalty Points Engine</strong> is designed with transaction correctness and absolute traceability in mind.
                  Unlike standard ledger tables that perform row updates on current balances, this engine enforces a 
                  <strong className="font-semibold text-white">strictly immutable Points Ledger</strong>. All loyalty point earnings (CREDIT), redemptions (DEBIT), and corrections 
                  (REVERSAL) are added as separate ledger records. User balances are calculated on-the-fly at runtime, ensuring 
                  fault tolerance and auditability.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                  <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-850">
                    <h4 className="font-semibold text-white mb-1 flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      <span>Idempotency First</span>
                    </h4>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Every event contains a unique <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 font-mono text-[11px]">event_id</code>. Duplicate attempts are rejected, ensuring zero duplicate ledger entries and zero double-issued points.
                    </p>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-850">
                    <h4 className="font-semibold text-white mb-1 flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Configurable Rules</span>
                    </h4>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Point formulas, units, bonuses, weekend multipliers, and maximum event caps are managed via a JSON rules file and processed in a robust isolated rule solver.
                    </p>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-850">
                    <h4 className="font-semibold text-white mb-1 flex items-center space-x-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>Audit Integrity</span>
                    </h4>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Earning events can be fully reversed. Reversing creates a compensating ledger entry with matching negative value, allowing negative balance adjustments.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EVENTS INGESTION */}
          {activeTab === "events" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
              
              {/* Submission Form */}
              <div className="bg-slate-950 p-8 rounded-xl border border-slate-800 shadow-xl space-y-6">
                <h3 className="text-lg font-bold text-white">Ingest New Event</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Event ID (Unique Constraint)</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={ingestEventId}
                        onChange={(e) => setIngestEventId(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full"
                        placeholder="evt_001"
                      />
                      <button
                        onClick={generateNewEventId}
                        className="bg-slate-850 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded text-sm transition"
                        title="Generate Random ID"
                      >
                        Roll
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">User ID</label>
                    <input
                      type="text"
                      value={ingestUserId}
                      onChange={(e) => setIngestUserId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full"
                      placeholder="user_123"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Event Type</label>
                      <select
                        value={ingestType}
                        onChange={(e) => setIngestType(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full"
                      >
                        <option value="deposit">deposit</option>
                        <option value="purchase">purchase</option>
                        <option value="referral">referral</option>
                        <option value="withdrawal">withdrawal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Amount</label>
                      <input
                        type="number"
                        value={ingestAmount}
                        onChange={(e) => setIngestAmount(Number(e.target.value))}
                        className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Event Timestamp (ISO format)</label>
                    <input
                      type="text"
                      value={ingestTimestamp}
                      onChange={(e) => setIngestTimestamp(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full"
                      placeholder="2026-06-20T10:30:00"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">Note: Weekend events trigger weekend multipliers if enabled.</span>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => handleIngestEvent()}
                    disabled={ingestLoading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded transition disabled:opacity-50"
                  >
                    {ingestLoading ? "Processing..." : "Submit Event"}
                  </button>
                  <button
                    onClick={() => handleIngestEvent(lastSubmittedPayload)}
                    disabled={ingestLoading || !lastSubmittedPayload}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2.5 px-4 rounded transition disabled:opacity-50 border border-slate-700"
                    title="Resubmits the exact same payload to test backend idempotency."
                  >
                    Submit Same Event Again
                  </button>
                </div>
              </div>

              {/* Ingestion Response Console */}
              <div className="bg-slate-950 p-8 rounded-xl border border-slate-800 shadow-xl flex flex-col justify-between h-full">
                <div>
                  <h3 className="text-lg font-bold text-white mb-4">API Response Console</h3>
                  
                  {ingestError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 text-sm">
                      <h4 className="font-bold uppercase text-xs mb-1">Error Response</h4>
                      <p>{ingestError}</p>
                    </div>
                  )}

                  {!ingestError && !ingestResponse && (
                    <div className="text-slate-500 text-sm italic py-10 text-center">
                      Submit an event to inspect rule outcomes and balance details here.
                    </div>
                  )}

                  {ingestResponse && (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-lg border text-sm ${
                        ingestResponse.status === "duplicate" 
                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400" 
                          : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      }`}>
                        <div className="font-bold uppercase text-xs mb-1 flex items-center space-x-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            ingestResponse.status === "duplicate" ? "bg-amber-400" : "bg-emerald-400"
                          }`}></span>
                          <span>Event {ingestResponse.status === "duplicate" ? "Duplicate Detected" : "Processed Successfully"}</span>
                        </div>
                        <p className="text-xs mt-1 text-slate-300">
                          {ingestResponse.status === "duplicate"
                            ? "Idempotency handler triggered: No database changes were made, and no points were double-awarded."
                            : "New event recorded and points added to the user's ledger."}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm bg-slate-900 p-4 rounded-lg border border-slate-850">
                        <div>
                          <span className="text-slate-500 text-xs block uppercase">Points Awarded</span>
                          <span className="text-xl font-bold text-white">{ingestResponse.points_awarded} pts</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-xs block uppercase">Balance After Event</span>
                          <span className="text-xl font-bold text-indigo-400">{ingestResponse.current_balance} pts</span>
                        </div>
                      </div>

                      {ingestResponse.event.rule_snapshot && (
                        <div className="text-xs bg-slate-900 p-4 rounded-lg border border-slate-850 space-y-2 max-h-56 overflow-y-auto">
                          <span className="text-slate-400 font-bold uppercase tracking-wider block">Applied Engine Rules:</span>
                          <ul className="space-y-1.5 text-slate-300 list-disc list-inside">
                            {ingestResponse.event.rule_snapshot.calculation_steps?.map((step: string, i: number) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {lastSubmittedPayload && (
                  <div className="pt-4 border-t border-slate-850">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase block mb-1">Last Submitted Payload</span>
                    <pre className="text-[10px] bg-slate-900 p-2 rounded border border-slate-850 overflow-x-auto text-slate-400">
                      {JSON.stringify(lastSubmittedPayload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: USER DASHBOARD */}
          {activeTab === "users" && (
            <div className="space-y-8 max-w-6xl">
              {/* Account Overview Bar */}
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <span className="text-slate-500 text-xs uppercase font-semibold block tracking-wider">Account Balance</span>
                  <div className="flex items-baseline space-x-2 mt-1">
                    <span className="text-4xl font-extrabold text-white">
                      {userBalance !== null ? userBalance : "—"}
                    </span>
                    <span className="text-slate-400 text-sm font-semibold">Points</span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <span className="text-slate-500 text-xs uppercase block font-semibold tracking-wider">User ID Context</span>
                    <span className="text-indigo-400 font-bold text-sm block mt-1">{activeUserId}</span>
                  </div>
                  <button
                    onClick={() => fetchUserAccountData(activeUserId)}
                    disabled={userLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded text-sm transition disabled:opacity-50"
                  >
                    {userLoading ? "Loading..." : "Refresh Account"}
                  </button>
                </div>
              </div>

              {/* Grid: Ledger History (Left) & Rewards Catalog (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Ledger Viewer */}
                <div className="lg:col-span-2 bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-xl space-y-4">
                  <h3 className="text-lg font-bold text-white">Points Ledger History</h3>
                  
                  {userError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg p-4 text-sm">
                      {userError}
                    </div>
                  )}

                  {!userLoading && userLedger.length === 0 && (
                    <div className="text-slate-500 text-sm italic py-16 text-center border border-dashed border-slate-850 rounded-lg">
                      No ledger history found for user '{activeUserId}'.
                    </div>
                  )}

                  {userLedger.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-450 uppercase text-xs tracking-wider">
                            <th className="py-3 px-4 font-semibold">Timestamp</th>
                            <th className="py-3 px-4 font-semibold">Type</th>
                            <th className="py-3 px-4 font-semibold">Reference ID</th>
                            <th className="py-3 px-4 font-semibold text-right">Points</th>
                            <th className="py-3 px-4 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-slate-350">
                          {userLedger.map((entry) => (
                            <tr key={entry.id} className="hover:bg-slate-900/40">
                              <td className="py-3 px-4 text-xs font-mono text-slate-500">
                                {new Date(entry.created_at).toLocaleString()}
                              </td>
                              <td className="py-3 px-4">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                                  entry.entry_type === "CREDIT"
                                    ? "bg-emerald-500/10 text-emerald-400"
                                    : entry.entry_type === "DEBIT"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : "bg-amber-500/10 text-amber-400"
                                }`}>
                                  {entry.entry_type}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-xs font-mono text-slate-400">{entry.reference_id}</td>
                              <td className={`py-3 px-4 text-right font-bold ${
                                entry.points > 0 
                                  ? "text-emerald-400" 
                                  : entry.points < 0 
                                  ? "text-rose-400" 
                                  : "text-slate-400"
                              }`}>
                                {entry.points > 0 ? `+${entry.points}` : entry.points}
                              </td>
                              <td className="py-3 px-4 text-xs text-slate-400">{entry.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Rewards and Redemption */}
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-xl space-y-6">
                  <h3 className="text-lg font-bold text-white">Redeem Rewards</h3>
                  
                  {redemptionMessage && (
                    <div className={`p-3 rounded-lg text-sm border ${
                      redemptionMessage.type === "success" 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    }`}>
                      {redemptionMessage.text}
                    </div>
                  )}

                  <div className="space-y-4">
                    {rewards.map((reward) => {
                      const isAffordable = userBalance !== null && userBalance >= reward.cost;
                      return (
                        <div key={reward.reward_id} className="bg-slate-900 p-4 rounded-lg border border-slate-850 flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-sm text-white">{reward.name}</h4>
                            <span className="text-xs text-slate-500 font-semibold uppercase">{reward.cost} Points</span>
                          </div>
                          
                          <button
                            onClick={() => handleRedeem(reward.reward_id)}
                            disabled={redemptionLoading !== null || !isAffordable}
                            className={`px-3 py-1.5 rounded text-xs font-bold transition uppercase tracking-wider ${
                              isAffordable
                                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                : "bg-slate-800 text-slate-500 cursor-not-allowed"
                            }`}
                          >
                            {redemptionLoading === reward.reward_id ? "Redeeming..." : "Redeem"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 4: REVERSALS */}
          {activeTab === "reversals" && (
            <div className="max-w-2xl bg-slate-950 p-8 rounded-xl border border-slate-800 shadow-xl space-y-6">
              <h3 className="text-lg font-bold text-white">Audit Event Reversal</h3>
              <p className="text-slate-400 text-sm">
                Enter an <code className="bg-slate-900 px-1 py-0.5 rounded text-indigo-300 font-mono text-[11px]">event_id</code> corresponding to a previously processed earning event. 
                The system will automatically cancel the points awarded by adding a compensating 
                <strong className="font-semibold text-white">REVERSAL</strong> entry to the ledger.
              </p>

              {reversalResult && (
                <div className={`p-4 rounded-lg text-sm border ${
                  reversalResult.type === "success"
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                }`}>
                  <h4 className="font-bold uppercase text-xs mb-1">Reversal Status</h4>
                  <p>{reversalResult.text}</p>
                </div>
              )}

              <form onSubmit={handleReverse} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">Original Event ID</label>
                  <input
                    type="text"
                    value={reverseEventId}
                    onChange={(e) => setReverseEventId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 w-full"
                    placeholder="evt_001"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={reversalLoading || !reverseEventId.trim()}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 px-4 rounded transition disabled:opacity-50"
                >
                  {reversalLoading ? "Processing Reversal..." : "Reverse Event"}
                </button>
              </form>
            </div>
          )}

          {/* TAB 5: RULES CONFIG */}
          {activeTab === "rules" && (
            <div className="space-y-8 max-w-6xl">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4">Loyalty Rules Table</h3>
                
                {rulesLoading && (
                  <div className="text-slate-500 text-sm italic py-10 text-center">Loading engine configuration...</div>
                )}

                {rules && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    
                    {/* Event Rules */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-indigo-400 text-sm uppercase tracking-wider">Event Rules Configuration</h4>
                      
                      <div className="space-y-3">
                        {Object.entries(rules.event_rules).map(([type, config]) => (
                          <div key={type} className="bg-slate-900 p-4 rounded-lg border border-slate-850">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-extrabold text-white uppercase text-xs tracking-wider">{type}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-850 rounded text-slate-400 uppercase">
                                CAP: {config.cap} Points
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 space-y-1">
                              {config.fixed_points !== undefined ? (
                                <p>Fixed points awarded: <strong className="text-white">{config.fixed_points}</strong></p>
                              ) : (
                                <>
                                  <p>Points per unit: <strong className="text-white">{config.points_per_unit}</strong></p>
                                  <p>Unit amount: <strong className="text-white">{config.unit_amount}</strong></p>
                                  <p>Base bonus points: <strong className="text-white">{config.base_bonus}</strong></p>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bonus Rules */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-indigo-400 text-sm uppercase tracking-wider">Bonus Configurations</h4>
                      
                      <div className="bg-slate-900 p-6 rounded-lg border border-slate-850 space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white">Weekend Multiplier Rule</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            rules.bonus_rules.weekend_multiplier?.enabled
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-800 text-slate-500"
                          }`}>
                            {rules.bonus_rules.weekend_multiplier?.enabled ? "ENABLED" : "DISABLED"}
                          </span>
                        </div>
                        
                        <p className="text-xs text-slate-400 leading-relaxed">
                          When enabled, events submitted with timestamp dates falling on Saturday or Sunday will have their 
                          base calculated points multiplied by the weekend multiplier factor, subject to the final event cap.
                        </p>

                        <div className="bg-slate-950 p-4 rounded border border-slate-800 flex justify-between items-center text-sm">
                          <span className="text-slate-500">Multiplier Value</span>
                          <strong className="text-white text-lg">x{rules.bonus_rules.weekend_multiplier?.multiplier || 1}</strong>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
