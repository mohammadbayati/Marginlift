import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ssrManifest = JSON.parse(await readFile(resolve(".prerender/.vite/manifest.json"), "utf8"));
const ssrEntry = ssrManifest["src/entries/prerender.tsx"] || Object.values(ssrManifest).find((item) => item.isEntry);
if (!ssrEntry?.file) throw new Error("Prerender entry is missing from SSR manifest");
const { renderPublic } = await import(pathToFileURL(resolve(".prerender", ssrEntry.file)).href);

const pages = [
  ["index.html", "/"], ["login.html", "/login"], ["signup.html", "/signup"],
  ["pilot.html", "/pilot"], ["security.html", "/security"], ["privacy.html", "/privacy"],
  ["terms.html", "/terms"], ["deck.html", "/deck"], ["submission.html", "/submission"],
  ["pilot-data-request.html", "/pilot-data-request"],
];

for (const [file, pathname] of pages) {
  const target = resolve("dist", file);
  const source = await readFile(target, "utf8");
  const html = renderPublic(pathname);
  if (!source.includes("<!--app-html-->")) throw new Error(`Prerender marker missing in ${file}`);
  await writeFile(target, source.replace("<!--app-html-->", html), "utf8");
}
await rm(resolve(".prerender"), { recursive: true, force: true });
