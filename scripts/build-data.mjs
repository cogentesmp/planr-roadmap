#!/usr/bin/env node
// Build planr-activities.json from the PLANR project board (issues = source of truth).
// Env: GH_TOKEN / GITHUB_TOKEN  (needs Projects:read + Issues:read on cogentesmp/agsteward)
//      PLANR_PASSPHRASE (optional) — if set, also writes the encrypted planr-activities.enc
import { writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("Missing GH_TOKEN/GITHUB_TOKEN"); process.exit(1); }
const PROJECT_ID = "PVT_kwDOBTIPpc4AzoBZ";        // cogentesmp PLANR project
const TASK_RE = /^(T\d+\.\d+[a-z]?)\s*[—-]\s*(.+)$/; // "T1.1a — Title"
const STATUS_MAP = { "Blocked":"on hold", "Todo":"scheduled", "In Progress":"in progress", "Done":"done" };

async function gql(query, variables) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) {
    // The PLANR board holds issues from other repos this token can't read; GitHub
    // returns those nodes as null alongside FORBIDDEN errors. Proceed with what we can
    // see (our roadmap issues live in agsteward) and only fail if nothing came back.
    const onlyForbidden = j.errors.every(e => e.type === "FORBIDDEN");
    if (j.data && onlyForbidden) {
      console.warn(`GraphQL: skipped ${j.errors.length} inaccessible item(s) (other repos)`);
      return j.data;
    }
    throw new Error(JSON.stringify(j.errors));
  }
  return j.data;
}

// ---- pull every project item (paginated) ----
const Q = `query($id:ID!,$cursor:String){ node(id:$id){ ... on ProjectV2 {
  items(first:100, after:$cursor){ pageInfo{ hasNextPage endCursor }
    nodes{
      fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue { name } }
      content{ ... on Issue {
        number title body url state
        labels(first:20){ nodes{ name } }
      } }
    } } } } }`;

const items = [];
let cursor = null;
do {
  const d = await gql(Q, { id: PROJECT_ID, cursor });
  const page = d.node.items;
  items.push(...page.nodes);
  cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (cursor);

// ---- body parsing helpers ----
function section(body, heading) {
  const re = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|<!--\\s*PLANR:BEGIN|\\Z)`, "im");
  const m = body.match(re);
  return m ? m[1].trim() : "";
}
function planrBlock(body) {
  const m = body.match(/```planr\s*([\s\S]*?)```/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split("\n")) {
    const mm = line.replace(/#.*$/, "").match(/^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/);
    if (!mm) continue;
    let [, k, v] = mm;
    if (/^\[.*\]$/.test(v)) v = v.slice(1,-1).split(",").map(s=>s.trim()).filter(Boolean);
    else if (/^(true|false)$/i.test(v)) v = /true/i.test(v);
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    else if (/^(none|null)$/i.test(v)) v = null;
    out[k] = v;
  }
  return out;
}

// ---- assemble activities ----
const activities = [];
for (const it of items) {
  const c = it.content;
  if (!c || !c.title) continue;
  const m = c.title.match(TASK_RE);
  if (!m) continue;                        // only roadmap issues (TX.X — …)
  const id = m[1], title = m[2].trim(), body = c.body || "";
  const tierLabel = (c.labels.nodes.find(l => /^Tier\s+\d/i.test(l.name)) || {}).name;
  const boardStatus = it.fieldValueByName?.name || null;
  const pb = planrBlock(body);
  const status = STATUS_MAP[boardStatus] || (c.state === "CLOSED" ? "done" : "on hold");
  activities.push({
    id,
    tier: tierLabel ? Number(tierLabel.replace(/\D/g, "")) : null,
    days: pb.days ?? null,
    title,
    description: section(body, "Description"),
    completionCriteria: section(body, "Completion criteria"),
    githubIssue: c.url,
    risk: section(body, "Risk"),
    include: pb.include ?? true,
    dependsOn: pb.dependsOn ?? [],
    externalDependencies: section(body, "External dependencies").replace(/^none$/i, ""),
    startDate: pb.startDate ?? null,
    allocation: pb.allocation ?? 100,
    ready: boardStatus === "Todo" || boardStatus === "In Progress",
    status,
    _issue: c.number,
  });
}
activities.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric:true }));

const json = { generatedAt: new Date().toISOString(), activities };
writeFileSync(new URL("../planr-activities.json", import.meta.url), JSON.stringify(json, null, 2));
console.log(`Wrote planr-activities.json — ${activities.length} tasks`);
for (const a of activities) console.log(`  ${a.id.padEnd(6)} #${a._issue}  ${a.status.padEnd(12)} days=${a.days ?? "?"}  ${a.title.slice(0,40)}`);

// ---- optional encryption (AES-GCM, PBKDF2) matching the in-page decryptor ----
if (process.env.PLANR_PASSPHRASE) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMat = await crypto.subtle.importKey("raw", enc.encode(process.env.PLANR_PASSPHRASE), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name:"PBKDF2", salt, iterations:250000, hash:"SHA-256" },
    keyMat, { name:"AES-GCM", length:256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, enc.encode(JSON.stringify(json))));
  const b64 = b => Buffer.from(b).toString("base64");
  writeFileSync(new URL("../planr-activities.enc", import.meta.url),
    JSON.stringify({ v:1, kdf:"PBKDF2-SHA256", iterations:250000, salt:b64(salt), iv:b64(iv), ct:b64(ct) }));
  console.log("Wrote planr-activities.enc (encrypted)");
}
