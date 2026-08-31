import { LoginPage, SignupPage } from "./pages/AuthShellPage";
import { DeckPage } from "./pages/DeckPage";
import { PilotDataRequestPage } from "./pages/PilotDataRequestPage";
import { PilotPage } from "./pages/PilotPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SalesHomePage } from "./pages/SalesHomePage";
import { SecurityPage } from "./pages/SecurityPage";
import { SubmissionPage } from "./pages/SubmissionPage";
import { TermsPage } from "./pages/TermsPage";
import "./styles/public.css";

export const PUBLIC_ROUTE_COMPONENTS = Object.freeze({
  "/": SalesHomePage,
  "/sales": SalesHomePage,
  "/pilot": PilotPage,
  "/security": SecurityPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  "/login": LoginPage,
  "/signup": SignupPage,
  "/deck": DeckPage,
  "/submission": SubmissionPage,
  "/pilot-data-request": PilotDataRequestPage,
});

const legacyAliases = Object.freeze({
  "/sales.html": "/sales",
  "/pilot.html": "/pilot",
  "/security.html": "/security",
  "/privacy.html": "/privacy",
  "/terms.html": "/terms",
  "/deck.html": "/deck",
  "/submission.html": "/submission",
  "/pilot-data-request.html": "/pilot-data-request",
});

export function normalizePublicPath(pathname = "/") {
  const rawPath = pathname.split("?")[0].split("#")[0] || "/";
  const withoutTrailingSlash = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  return legacyAliases[withoutTrailingSlash] || withoutTrailingSlash;
}
export function resolvePublicRoute(pathname) {
  return PUBLIC_ROUTE_COMPONENTS[normalizePublicPath(pathname)] || null;
}

export function PublicSite({ pathname, authHandlers = {} }) {
  const activePath = pathname || (typeof window !== "undefined" ? window.location.pathname : "/");
  const normalizedPath = normalizePublicPath(activePath);
  const RouteComponent = resolvePublicRoute(normalizedPath);

  if (!RouteComponent) return null;
  if (normalizedPath === "/login") return <RouteComponent onSubmit={authHandlers.login} />;
  if (normalizedPath === "/signup") return <RouteComponent onSubmit={authHandlers.signup} />;
  return <RouteComponent />;
}
