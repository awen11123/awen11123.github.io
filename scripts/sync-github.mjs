#!/usr/bin/env node
// Sync open-source contribution data from GitHub into the academic site.
// Updates:
//   _pages/projects.html   — full regeneration (Featured + Contributions sections)
//   _pages/cv.md            — patches block between CONTRIBUTIONS markers

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const USERNAME = process.env.GH_USERNAME || "awen11123";
const PROJECTS = "_pages/projects.html";
const CV = "_pages/cv.md";

const gh = (args) =>
  execSync(`gh ${args}`, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
const ghJSON = (args) => JSON.parse(gh(args));

// Retry wrapper for flaky per-repo lookups.
function ghJSONRetry(args, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return ghJSON(args); }
    catch (e) {
      last = e;
      const end = Date.now() + 500 * (i + 1);
      while (Date.now() < end) {}
    }
  }
  throw last;
}

// ---------- featured projects (curated) ----------
const FEATURED = [
  {
    repo: "awen11123/usage-pet",
    title: "🐱 usage-pet",
    description: "macOS 桌面像素宠物，实时显示 Claude / Codex 用量额度",
    tags: [{ text: "Swift", color: "#F05138" }, { text: "macOS", color: "#000000" }],
  },
  {
    repo: "awen11123/awen11123.github.io",
    title: "🌐 个人主页",
    description: "基于 Jekyll + academicpages 搭建的学术个人主页，CV / 项目 / 贡献自动同步",
    tags: [{ text: "Jekyll", color: "#cc0000" }, { text: "SCSS", color: "#c6538c" }],
  },
];

// Common language colors used for live-fetched contribution cards.
const LANG_COLOR = {
  Swift: "#F05138", Python: "#3572A5", TypeScript: "#3178c6",
  JavaScript: "#f1e05a", Go: "#00ADD8", Rust: "#dea584",
  Java: "#b07219", Ruby: "#701516", PHP: "#4F5D95",
  Shell: "#89e051", HTML: "#e34c26", CSS: "#663399",
  MDX: "#fcb32c", Dockerfile: "#384d54",
};
const langColor = (l) => LANG_COLOR[l] || "#6e7681";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ============================================================
// Fetch GitHub data
// ============================================================

console.log("Fetching merged PRs...");
const prs = ghJSON(
  `search prs --author ${USERNAME} --merged --limit 200 ` +
    `--json repository,title,url,number,updatedAt`,
);

const external = prs.filter(
  (p) =>
    !p.repository.nameWithOwner.toLowerCase().startsWith(`${USERNAME.toLowerCase()}/`),
);

const byRepo = new Map();
for (const pr of external) {
  const key = pr.repository.nameWithOwner;
  if (!byRepo.has(key)) byRepo.set(key, []);
  byRepo.get(key).push(pr);
}

const contributions = [];
for (const [name, list] of byRepo) {
  const [owner, repo] = name.split("/");
  console.log(`  fetching ${name}...`);
  const meta = ghJSONRetry(`api repos/${owner}/${repo}`);
  contributions.push({
    owner, repo, name,
    description: meta.description || "",
    language: meta.language,
    stars: meta.stargazers_count,
    forks: meta.forks_count,
    prs: list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  });
}
contributions.sort((a, b) => b.prs.length - a.prs.length);

// Also fetch featured repo metadata so star counts stay live.
const featuredCards = [];
for (const f of FEATURED) {
  const [owner, repo] = f.repo.split("/");
  console.log(`  fetching featured ${f.repo}...`);
  let meta;
  try { meta = ghJSONRetry(`api repos/${owner}/${repo}`); }
  catch { meta = { stargazers_count: 0, forks_count: 0 }; }
  featuredCards.push({ ...f, owner, repo, stars: meta.stargazers_count, forks: meta.forks_count });
}

// ============================================================
// Render projects.html
// ============================================================

const cardStyle = `border: 1px solid #e1e4e8; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); transition: box-shadow 0.2s; background: #fff;`;

function tagBadge({ text, color }) {
  return `<span style="background: ${color}; color: #fff; padding: 2px 10px; border-radius: 20px; font-size: 0.8rem; margin-left: 4px;">${esc(text)}</span>`;
}

function featuredCard(c) {
  const tags = c.tags.map(tagBadge).join("");
  const url = `https://github.com/${c.owner}/${c.repo}`;
  return `
  <div class="project-card" style="${cardStyle}">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
      <h3 style="margin: 0;">
        <a href="${url}" target="_blank" rel="noopener" style="text-decoration: none;">${esc(c.title)}</a>
      </h3>
      <div>${tags}</div>
    </div>
    <p style="color: #586069; margin: 0.8rem 0 0.5rem;">${esc(c.description)}</p>
    <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.85rem; color: #888;">
      <span>⭐ ${c.stars}</span>
      <span>🔀 ${c.forks}</span>
      <span>🔗 <a href="${url}" target="_blank" rel="noopener">${esc(c.owner)}/${esc(c.repo)}</a></span>
    </div>
  </div>`;
}

function contribCard(c) {
  const langBadge = c.language
    ? `<span style="background: ${langColor(c.language)}; color: #fff; padding: 2px 10px; border-radius: 20px; font-size: 0.8rem;">${esc(c.language)}</span>`
    : "";
  const prList = c.prs
    .map(
      (p) => `
          <li style="margin-bottom: 0.5rem;">
            <a href="${p.url}" target="_blank" rel="noopener"><strong>PR #${p.number}</strong></a>
            — ${esc(p.title)}
            <span style="background: #28a745; color: #fff; padding: 1px 6px; border-radius: 10px; font-size: 0.7rem;">merged</span>
          </li>`,
    )
    .join("");
  const url = `https://github.com/${c.owner}/${c.repo}`;
  return `
  <div class="project-card" style="${cardStyle}">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
      <h3 style="margin: 0;">
        <a href="${url}" target="_blank" rel="noopener" style="text-decoration: none;">📦 ${esc(c.owner)}/${esc(c.repo)}</a>
      </h3>
      <div>${langBadge}</div>
    </div>
    <p style="color: #586069; margin: 0.8rem 0 0.5rem;">${esc(c.description)}</p>
    <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.85rem; color: #888;">
      <span>⭐ ${c.stars}</span>
      <span>🔀 ${c.forks}</span>
      <span>✅ ${c.prs.length} merged PR${c.prs.length > 1 ? "s" : ""}</span>
    </div>
    <div style="margin-top: 1rem; border-top: 1px solid #eee; padding-top: 0.8rem;">
      <details>
        <summary style="cursor: pointer; font-weight: 600; color: #0366d6;">📋 我的贡献 (${c.prs.length})</summary>
        <ul style="margin-top: 0.5rem; padding-left: 1.2rem;">${prList}
        </ul>
      </details>
    </div>
  </div>`;
}

const updateStamp = new Date().toISOString().slice(0, 10);
const projectsHtml = `---
layout: archive
title: "项目"
permalink: /projects/
author_profile: true
classes: wide
---

<div class="projects-intro" style="margin-bottom: 2rem;">
  <p style="font-size: 1.1rem; color: #555;">
    精选项目和开源贡献。开源贡献部分每天自动同步自 GitHub，最近一次更新：${updateStamp}。
  </p>
</div>

<h2 id="featured">🏆 精选项目</h2>

<div class="project-cards">
${featuredCards.map(featuredCard).join("\n")}
</div>

<h2 id="contributions">🌱 开源贡献</h2>

<p style="color: #666;">
  以下仓库的 PR 已被合并，按贡献数量排序。卡片中的 stars / forks / 描述每天自动从 GitHub 拉取。
</p>

<div class="project-cards">
${contributions.map(contribCard).join("\n")}
</div>

<div style="margin-top: 2rem; padding: 1rem; background: #f6f8fa; border-radius: 8px; text-align: center;">
  <p style="margin: 0; color: #586069;">
    更多项目请访问 <a href="https://github.com/${USERNAME}" target="_blank" rel="noopener">github.com/${USERNAME}</a>
  </p>
</div>

<style>
.project-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
}
</style>
`;

writeFileSync(PROJECTS, projectsHtml);
console.log(`Wrote ${PROJECTS} (${featuredCards.length} featured + ${contributions.length} contributions)`);

// ============================================================
// Patch CV contributions block
// ============================================================

const START = "<!-- CONTRIBUTIONS:START -->";
const END = "<!-- CONTRIBUTIONS:END -->";

const cvBlock = contributions
  .map((c) => {
    const head = `- **[${c.owner}/${c.repo}](https://github.com/${c.owner}/${c.repo})** —— ${c.description || "(无描述)"}`;
    const items = c.prs
      .map((p) => `  - [PR #${p.number}](${p.url})：${p.title.replace(/\|/g, "\\|")}`)
      .join("\n");
    return `${head}\n${items}`;
  })
  .join("\n\n");

const cvText = readFileSync(CV, "utf8");
if (!cvText.includes(START) || !cvText.includes(END))
  throw new Error("CV markers missing");

const block = `${START}\n\n_最近更新：${updateStamp}_\n\n${cvBlock || "_暂无外部贡献_"}\n\n${END}`;
writeFileSync(
  CV,
  cvText.replace(
    new RegExp(`${START}[\\s\\S]*?${END}`),
    block.replace(/\$/g, "$$$$"),
  ),
);
console.log(`Patched ${CV}`);
