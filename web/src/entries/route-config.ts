export type RouteDefinition = {
  id: string;
  html: string;
  paths: string[];
  kind: "app" | "public";
  prerender?: boolean;
};

export const ROUTES: RouteDefinition[] = [
  { id: "sales", html: "index.html", paths: ["/", "/sales"], kind: "public", prerender: true },
  { id: "login", html: "login.html", paths: ["/login"], kind: "public", prerender: true },
  { id: "signup", html: "signup.html", paths: ["/signup"], kind: "public", prerender: true },
  { id: "pilot", html: "pilot.html", paths: ["/pilot"], kind: "public", prerender: true },
  { id: "security", html: "security.html", paths: ["/security"], kind: "public", prerender: true },
  { id: "privacy", html: "privacy.html", paths: ["/privacy"], kind: "public", prerender: true },
  { id: "terms", html: "terms.html", paths: ["/terms"], kind: "public", prerender: true },
  { id: "deck", html: "deck.html", paths: ["/deck"], kind: "public", prerender: true },
  { id: "submission", html: "submission.html", paths: ["/submission"], kind: "public", prerender: true },
  { id: "pilot-data-request", html: "pilot-data-request.html", paths: ["/pilot-data-request"], kind: "public", prerender: true },
  { id: "app", html: "app.html", paths: ["/app", "/app/today", "/app/data", "/app/decisions", "/app/pilot", "/app/evidence", "/app/settings", "/app/report"], kind: "app" },
];

export function routeMatchesPath(route: RouteDefinition, pathname: string) {
  return route.paths.includes(pathname) || (route.id === "app" && pathname.startsWith("/app/"));
}
