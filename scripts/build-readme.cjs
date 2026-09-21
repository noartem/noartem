// Regenerates profile README.md:
//   - Portfolio table from projects defined in noartem.github.io (index.yml on main)
//   - Bucket table with versions from noartem/bucket manifests
//
// Usage: node scripts/build-readme.cjs
// Env:   GITHUB_TOKEN (optional, raises rate limits)

const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const SITE_INDEX_YML = "https://raw.githubusercontent.com/noartem/noartem.github.io/main/index.yml";
const BUCKET_API = "https://api.github.com/repos/noartem/bucket/contents/bucket";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "noartem-profile-sync",
};
if (process.env.GITHUB_TOKEN) GH_HEADERS.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function fetchBucketApps() {
  const res = await fetch(BUCKET_API, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`Bucket listing: ${res.status}`);
  const entries = await res.json();
  const apps = [];
  for (const entry of entries.filter((e) => e.name.endsWith(".json"))) {
    const r = await fetch(entry.url, { headers: { ...GH_HEADERS, Accept: "application/vnd.github.raw" } });
    if (!r.ok) throw new Error(`Manifest ${entry.name}: ${r.status}`);
    const m = JSON.parse(await r.text());
    const fromHomepage = (m.homepage || "").startsWith("https://github.com/")
      ? m.homepage.replace("https://github.com/", "").replace(/\/$/, "")
      : null;
    const fromCheckver =
      m.checkver && typeof m.checkver === "object" && (m.checkver.github || "").startsWith("https://github.com/")
        ? m.checkver.github.replace("https://github.com/", "").replace(/\/$/, "")
        : null;
    apps.push({
      name: entry.name.replace(/\.json$/, ""),
      version: String(m.version),
      url: m.homepage,
      description: m.description || "",
      license: m.license || "",
      repo: fromHomepage || fromCheckver,
    });
  }
  apps.sort((a, b) => a.name.localeCompare(b.name));
  return apps;
}

function renderReadme(projects, apps) {
  const projectRows = projects.map(
    (p) => `| ${p.stack.join(", ")} | [${p.name}](${p.url}) | ${(p.description || "").replace(/\n+/g, " ")} |`
  );
  const bucketRows = apps.map((a) => {
    const name = `[${a.name}](${a.url})`;
    const repo = a.repo ? `[${a.repo}](https://github.com/${a.repo})` : "—";
    return `| ${name} | ${a.version} | ${a.license} | ${repo} |`;
  });

  return `## Hi there 👋

- Software engineer interested in web
- :construction_worker: JavaScript, TypeScript, Vue, React, Golang, PHP, C++, Rust
- :mailbox_with_mail: <artem@noartem.ru>

## Portfolio

<!-- portfolio:start -->
| Stack | Name | Description |
|-------|------|-------------|
${projectRows.join("\n")}
<!-- portfolio:end -->

## Bucket

Scoop bucket with Windows apps I package and maintain: [noartem/bucket](https://github.com/noartem/bucket).

\`\`\`pwsh
scoop bucket add noartem https://github.com/noartem/bucket
scoop install noartem/twentymate
\`\`\`

<!-- bucket:start -->
| App | Version | License | Repository |
|-----|---------|---------|------------|
${bucketRows.join("\n")}
<!-- bucket:end -->
`;
}

async function main() {
  const [indexRes, apps] = await Promise.all([
    fetch(SITE_INDEX_YML, { headers: { "User-Agent": "noartem-profile-sync" } }),
    fetchBucketApps(),
  ]);
  if (!indexRes.ok) throw new Error(`index.yml fetch: ${indexRes.status}`);
  const projects = yaml.load(await indexRes.text()).projects;

  const readme = renderReadme(projects, apps);
  const dest = path.join(__dirname, "..", "README.md");
  if (fs.existsSync(dest) && fs.readFileSync(dest, "utf8") === readme) {
    console.log("README.md: unchanged");
    return;
  }
  fs.writeFileSync(dest, readme);
  console.log(`README.md: updated (${apps.length} bucket apps, ${projects.length} projects)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
