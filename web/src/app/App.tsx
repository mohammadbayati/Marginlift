import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell";
import { PersonaProvider } from "./persona";
import { LoadingState } from "../shared/ui";
import "../shared/styles/global.css";

const TodayPage = lazy(() => import("./pages/TodayPage").then((module) => ({ default: module.TodayPage })));
const DataPage = lazy(() => import("./pages/DataPage").then((module) => ({ default: module.DataPage })));
const DecisionsPage = lazy(() => import("./pages/DecisionsPage").then((module) => ({ default: module.DecisionsPage })));
const PilotPage = lazy(() => import("./pages/PilotPage").then((module) => ({ default: module.PilotPage })));
const EvidencePage = lazy(() => import("./pages/EvidencePage").then((module) => ({ default: module.EvidencePage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const ReportPage = lazy(() => import("./pages/ReportPage").then((module) => ({ default: module.ReportPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

export function MarginLiftApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <PersonaProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingState label="در حال آماده‌سازی صفحه…" />}><Routes>
            <Route path="/" element={<Navigate replace to="/app/today" />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate replace to="today" />} />
              <Route path="today" element={<TodayPage />} />
              <Route path="data" element={<DataPage />} />
              <Route path="decisions" element={<DecisionsPage />} />
              <Route path="pilot" element={<PilotPage />} />
              <Route path="evidence" element={<EvidencePage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="/report" element={<ReportPage />} />
            <Route path="/app/report" element={<ReportPage />} />
            <Route path="*" element={<Navigate replace to="/app/today" />} />
          </Routes></Suspense>
        </BrowserRouter>
      </PersonaProvider>
    </QueryClientProvider>
  );
}
