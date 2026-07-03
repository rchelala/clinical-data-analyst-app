"use client";

// Division Detail page: drill-down from a division card on /overview into
// that division's dashboards, report subscriptions, and the requests/tasks
// attached underneath them. Mirrors app/overview/page.tsx's scaffold
// (eclipse-glow/grain background, header shell, fetch-in-useEffect
// loading/error pattern) and translates the reference mockup's DETAIL VIEW
// (back-bar/breadcrumb, detail-kpis, section/data-table, subtab-bar) into
// this app's Eclipse Tailwind utilities.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Home,
  ClipboardList,
  Loader2,
  LayoutDashboard,
  Mail,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { DivisionDetailResponse, RequestType } from "@/lib/brain-types";
import { KpiCard } from "@/components/overview/KpiCard";
import {
  DashboardStatusBadge,
  RequestStatusBadge,
  TaskStatusBadge,
  OwnerChip,
} from "@/components/overview/StatusBadge";
import { DetailSection, SectionTab, EmptyRow, TH_CLASS, TD_CLASS } from "@/components/overview/DetailSection";

type RequestTab = "open" | "completed" | "all";
type TaskTab = "open" | "completed" | "all";

const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  feature: "Feature",
  bug: "Bug",
  field_request: "Field request",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isTaskCompleted(task: { status: string; completedDate: string | null }): boolean {
  return task.completedDate != null || task.status.toLowerCase() === "done" || task.status.toLowerCase().includes("complete");
}

export default function DivisionDetailPage() {
  const params = useParams<{ divisionId: string }>();
  const divisionId = params.divisionId;

  const [data, setData] = useState<DivisionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [requestTab, setRequestTab] = useState<RequestTab>("open");
  const [taskTab, setTaskTab] = useState<TaskTab>("open");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNotFound(false);
      try {
        const res = await fetch(`/api/overview/${divisionId}`);
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Could not load this division.");
        setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "An unexpected error occurred.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [divisionId]);

  const kpis = useMemo(() => {
    if (!data) return null;
    const activeDashboards = data.dashboards.filter((d) => d.status !== "retired").length;
    const activeSubscriptions = data.subscriptions.filter((s) => s.status !== "retired").length;
    const openRequests = data.requests.filter((r) => r.status !== "done").length;
    const completedRequests = data.requests.filter((r) => r.status === "done").length;
    const completedTasks = data.tasks.filter(isTaskCompleted).length;
    return {
      activeDashboards,
      activeSubscriptions,
      openRequests,
      completed: completedRequests + completedTasks,
    };
  }, [data]);

  const filteredRequests = useMemo(() => {
    if (!data) return [];
    if (requestTab === "open") return data.requests.filter((r) => r.status !== "done");
    if (requestTab === "completed") return data.requests.filter((r) => r.status === "done");
    return data.requests;
  }, [data, requestTab]);

  const filteredTasks = useMemo(() => {
    if (!data) return [];
    if (taskTab === "open") return data.tasks.filter((t) => !isTaskCompleted(t));
    if (taskTab === "completed") return data.tasks.filter((t) => isTaskCompleted(t));
    return data.tasks;
  }, [data, taskTab]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="eclipse-glow" />
      <div className="eclipse-grain" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-theme bg-secondary-glass hairline-top flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/overview"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Division Overview
          </Link>
          <Link
            href="/worklist"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <ClipboardList className="w-3 h-3" />
            Worklist
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors"
          >
            <Home className="w-3 h-3" />
            Home
          </Link>
          <div>
            <h1 className="text-base font-semibold text-primary leading-none flex items-center gap-1.5">
              <span className="text-secondary font-normal">Division Overview /</span>
              {data ? data.name : " "}
            </h1>
            <p className="text-xs text-secondary mt-0.5">
              Dashboards, subscriptions, and delivery activity for this division.
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            <p className="text-sm text-secondary">Loading…</p>
          </div>
        )}

        {!loading && notFound && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <p className="text-sm text-primary font-medium">Division not found.</p>
            <p className="text-xs text-secondary">
              It may have been removed, or the link is out of date.
            </p>
            <Link
              href="/overview"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-theme bg-panel hover:bg-panel/80 text-secondary hover:text-primary transition-colors mt-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Division Overview
            </Link>
          </div>
        )}

        {!loading && !notFound && error && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && !notFound && !error && data && kpis && (
          <div className="flex flex-col gap-6 max-w-6xl mx-auto">
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Active dashboards" value={kpis.activeDashboards} icon={LayoutDashboard} />
              <KpiCard label="Active subscriptions" value={kpis.activeSubscriptions} icon={Mail} />
              <KpiCard
                label="Open requests"
                value={kpis.openRequests}
                icon={AlertCircle}
                danger={kpis.openRequests > 0}
              />
              <KpiCard label="Completed" value={kpis.completed} icon={CheckCircle2} />
            </div>

            {/* Dashboards */}
            <DetailSection icon={LayoutDashboard} title="Dashboards" count={data.dashboards.length}>
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH_CLASS}>Name</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Owner</th>
                    <th className={TH_CLASS}>Last updated</th>
                    <th className={TH_CLASS}>Open requests</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dashboards.length === 0 ? (
                    <EmptyRow colSpan={5} message="No dashboards for this division." />
                  ) : (
                    data.dashboards.map((d) => (
                      <tr key={d.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className={`${TD_CLASS} text-primary font-medium`}>{d.name}</td>
                        <td className={TD_CLASS}>
                          <DashboardStatusBadge status={d.status} />
                        </td>
                        <td className={TD_CLASS}>
                          <OwnerChip name={d.ownerName} />
                        </td>
                        <td className={`${TD_CLASS} text-secondary`}>{formatDate(d.lastTouchedDate)}</td>
                        <td className={TD_CLASS}>
                          {d.openRequestCount > 0 ? (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                              {d.openRequestCount}
                            </span>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </DetailSection>

            {/* Report subscriptions */}
            <DetailSection icon={Mail} title="Report subscriptions" count={data.subscriptions.length}>
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH_CLASS}>Name</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Owner</th>
                    <th className={TH_CLASS}>Last updated</th>
                    <th className={TH_CLASS}>Open requests</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.length === 0 ? (
                    <EmptyRow colSpan={5} message="No report subscriptions for this division." />
                  ) : (
                    data.subscriptions.map((s) => (
                      <tr key={s.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className={`${TD_CLASS} text-primary font-medium`}>{s.name}</td>
                        <td className={TD_CLASS}>
                          <DashboardStatusBadge status={s.status} />
                        </td>
                        <td className={TD_CLASS}>
                          <OwnerChip name={s.ownerName} />
                        </td>
                        <td className={`${TD_CLASS} text-secondary`}>{formatDate(s.lastTouchedDate)}</td>
                        <td className={TD_CLASS}>
                          {s.openRequestCount > 0 ? (
                            <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                              {s.openRequestCount}
                            </span>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </DetailSection>

            {/* Requests */}
            <DetailSection
              icon={AlertCircle}
              title="Requests"
              count={data.requests.length}
              tabs={
                <>
                  <SectionTab label="Open" active={requestTab === "open"} onClick={() => setRequestTab("open")} />
                  <SectionTab
                    label="Completed"
                    active={requestTab === "completed"}
                    onClick={() => setRequestTab("completed")}
                  />
                  <SectionTab label="All" active={requestTab === "all"} onClick={() => setRequestTab("all")} />
                </>
              }
            >
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH_CLASS}>Title</th>
                    <th className={TH_CLASS}>Type</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Parent</th>
                    <th className={TH_CLASS}>Owner</th>
                    <th className={TH_CLASS}>Created</th>
                    <th className={TH_CLASS}>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length === 0 ? (
                    <EmptyRow
                      colSpan={7}
                      message={
                        requestTab === "open"
                          ? "No open requests."
                          : requestTab === "completed"
                          ? "No completed requests."
                          : "No requests for this division."
                      }
                    />
                  ) : (
                    filteredRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className={`${TD_CLASS} text-primary font-medium`}>{r.title}</td>
                        <td className={`${TD_CLASS} text-secondary`}>{REQUEST_TYPE_LABEL[r.requestType]}</td>
                        <td className={TD_CLASS}>
                          <RequestStatusBadge status={r.status} />
                        </td>
                        <td className={`${TD_CLASS} text-secondary`}>
                          {r.parentName}
                          <span className="text-secondary/60"> · {r.parentKind}</span>
                        </td>
                        <td className={TD_CLASS}>
                          <OwnerChip name={r.ownerName} />
                        </td>
                        <td className={`${TD_CLASS} text-secondary`}>{formatDate(r.createdDate)}</td>
                        <td className={`${TD_CLASS} text-secondary`}>{formatDate(r.completedDate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </DetailSection>

            {/* Tasks */}
            <DetailSection
              icon={CheckCircle2}
              title="Tasks"
              count={data.tasks.length}
              tabs={
                <>
                  <SectionTab label="Open" active={taskTab === "open"} onClick={() => setTaskTab("open")} />
                  <SectionTab
                    label="Completed"
                    active={taskTab === "completed"}
                    onClick={() => setTaskTab("completed")}
                  />
                  <SectionTab label="All" active={taskTab === "all"} onClick={() => setTaskTab("all")} />
                </>
              }
            >
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr>
                    <th className={TH_CLASS}>Title</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Context</th>
                    <th className={TH_CLASS}>Owner</th>
                    <th className={TH_CLASS}>Created</th>
                    <th className={TH_CLASS}>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.length === 0 ? (
                    <EmptyRow
                      colSpan={6}
                      message={
                        taskTab === "open"
                          ? "No open tasks."
                          : taskTab === "completed"
                          ? "No completed tasks."
                          : "No tasks for this division."
                      }
                    />
                  ) : (
                    filteredTasks.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className={`${TD_CLASS} text-primary font-medium`}>{t.title}</td>
                        <td className={TD_CLASS}>
                          <TaskStatusBadge status={t.status} />
                        </td>
                        <td className={`${TD_CLASS} text-secondary`}>
                          {t.contextName}
                          <span className="text-secondary/60"> · {t.contextKind}</span>
                        </td>
                        <td className={TD_CLASS}>
                          <OwnerChip name={t.ownerName ?? null} />
                        </td>
                        <td className={`${TD_CLASS} text-secondary`}>{formatDate(t.createdDate)}</td>
                        <td className={`${TD_CLASS} text-secondary`}>{formatDate(t.completedDate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </DetailSection>
          </div>
        )}
      </main>
    </div>
  );
}
