import { writeFile } from "node:fs/promises";

const manifest = {
  "/": "index.html", "/sales": "index.html", "/login": "login.html", "/signup": "signup.html",
  "/pilot": "pilot.html", "/security": "security.html", "/privacy": "privacy.html", "/terms": "terms.html",
  "/deck": "deck.html", "/submission": "submission.html", "/pilot-data-request": "pilot-data-request.html",
  "/app": "app.html", "/app/*": "app.html",
};
await writeFile("dist/route-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
