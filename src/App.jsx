import React from "react";
import { useState, useMemo, useEffect } from "react";
import { fetchClients, upsertClient, deleteClient as deleteClientDB, fetchCarriers, upsertCarrier, deleteCarrier as deleteCarrierDB, fetchTasks, upsertTask, deleteTask as deleteTaskDB, fetchDDR, upsertDDR, deleteDDR as deleteDDRDB, fetchMeetings, upsertMeeting, deleteMeeting as deleteMeetingDB, fetchTeams, upsertTeam, deleteTeam as deleteTeamDB, insertAuditLog, fetchAuditLogs } from './db.js';
import { supabase } from './supabase.js';

// ── Data ─────────────────────────────────────────────────────────────────────

const TEAMS = {
  India: {
    label: "India",
    color: "#cceeff",
    border: "#00A2E8",
    text: "#006fa0",
    members: [
      { name: "Renata", role: "Team Lead" },
      { name: "Mary", role: "Account Manager" },
      { name: "Kia", role: "Account Coordinator" },
    ],
  },
  Juliet: {
    label: "Juliet",
    color: "#ccf5d8",
    border: "#2ADB5E",
    text: "#1a9040",
    members: [
      { name: "Renata", role: "Team Lead" },
      { name: "Danielle", role: "Account Executive" },
      { name: "Kia", role: "Account Coordinator" },
    ],
  },
};

function getCoordinator(teamId) {
  const team = TEAMS[teamId];
  if (!team) return "Kia";
  const coord = team.members.find(m => m.role === "Account Coordinator");
  return coord ? coord.name : (team.members[0]?.name || "Kia");
}
function getAccountManager(teamId) {
  const team = TEAMS[teamId];
  if (!team) return "";
  const mgr = team.members.find(m => m.role === "Account Manager");
  return mgr ? mgr.name : "";
}
function getAccountExecutive(teamId) {
  const team = TEAMS[teamId];
  if (!team) return "";
  const exec = team.members.find(m => m.role === "Account Executive");
  return exec ? exec.name : "";
}
function getTeamLead(teamId) {
  const team = TEAMS[teamId];
  if (!team) return "";
  const lead = team.members.find(m => m.role === "Team Lead");
  return lead ? lead.name : "";
}

const TASK_ROLES = [
  "Account Coordinator",
  "Account Manager",
  "Account Executive",
  "Team Lead",
];

// Resolve a role string ("Account Coordinator" etc.) to the actual person
// on the given team. Falls back gracefully if role isn't filled on that team.
// Sync standard tasks from task DB to a client's miscTasks.
// Standard tasks that match the client's market/funding/carriers are added;
// existing standard tasks whose template was updated get the new label;
// standard tasks whose template was deleted or no longer matches are removed.
function syncStandardTasks(client, tasksDb) {
  if (!tasksDb || !tasksDb.length) return client;
  const standardTemplates = tasksDb.filter(t => t.isStandard);
  if (!standardTemplates.length) return client;

  function clientMatchesTemplate(c, tmpl) {
    if (tmpl.markets?.length && !tmpl.markets.includes(c.marketSize)) return false;
    if (tmpl.funding?.length && !tmpl.funding.includes(c.fundingMethod)) return false;
    if (tmpl.states?.length && c.groupSitus && !tmpl.states.includes(c.groupSitus)) return false;
    if (tmpl.carriers?.length) {
      const clientCarriers = Object.values(c.benefitCarriers || {}).filter(Boolean);
      if (!tmpl.carriers.some(tc => clientCarriers.includes(tc))) return false;
    }
    return true;
  }

  const existing = client.miscTasks || [];
  // Keep non-standard tasks unchanged
  const manualTasks = existing.filter(t => !t._standardTemplateId);
  // Build the new set of standard tasks for this client
  const newStandard = standardTemplates
    .filter(tmpl => clientMatchesTemplate(client, tmpl))
    .map(tmpl => {
      const found = existing.find(t => t._standardTemplateId === tmpl.id);
      return found
        ? { ...found, title: tmpl.label } // update label if changed, keep status/dates
        : {
            id: "std_" + tmpl.id + "_" + client.id,
            _standardTemplateId: tmpl.id,
            title: tmpl.label,
            status: "Not Started",
            assignee: resolveAssignee(tmpl.defaultAssignee || "", client.team) || "",
            dueDate: "", completedDate: "", notes: "", followUps: [],
          };
    });

  return { ...client, miscTasks: [...newStandard, ...manualTasks] };
}


function formatPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

// Format a raw numeric string as currency: $1,234.56
function formatCurrency(raw) {
  const clean = (raw || "").toString().replace(/[^0-9.]/g, "");
  if (!clean || clean === ".") return clean;
  const parts = clean.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? parts[0] + "." + parts[1].slice(0, 2) : parts[0];
}

// Format a raw numeric string as a plain integer with commas: 1,234
function formatInteger(raw) {
  const clean = (raw || "").toString().replace(/[^0-9]/g, "");
  if (!clean) return "";
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Strip formatting back to raw number string for storage
function stripNumeric(formatted) {
  return (formatted || "").toString().replace(/[^0-9.]/g, "");
}

// Reusable currency input — displays formatted, stores raw
function CurrencyInput({ value, onChange, placeholder, style, prefix = "$" }) {
  const [focused, setFocused] = React.useState(false);
  const [raw, setRaw] = React.useState(value != null && value !== "" ? String(value) : "");

  // Sync raw when parent changes value externally (not during focus)
  React.useEffect(() => {
    if (!focused) {
      setRaw(value != null && value !== "" ? String(value) : "");
    }
  }, [value, focused]);

  const displayValue = focused
    ? raw
    : raw && !isNaN(parseFloat(raw))
      ? parseFloat(raw).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : raw;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <span style={{ padding: "6px 8px", background: "#f1f5f9", border: "1.5px solid #e2e8f0",
        borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 12, color: "#475569", fontWeight: 600, flexShrink: 0 }}>{prefix}</span>
      <input
        type="text" inputMode="decimal"
        value={displayValue}
        placeholder={placeholder || "0.00"}
        onFocus={() => setFocused(true)}
        onChange={e => {
          const cleaned = e.target.value.replace(/[^0-9.]/g, "");
          setRaw(cleaned);
          onChange(cleaned);
        }}
        onBlur={() => {
          setFocused(false);
          const n = parseFloat(raw);
          if (!isNaN(n)) {
            const fixed = n.toFixed(2);
            setRaw(fixed);
            onChange(fixed);
          } else if (raw === "") {
            onChange("");
          }
        }}
        style={{ ...style, borderRadius: "0 8px 8px 0" }}
      />
    </div>
  );
}

// Reusable integer input with comma formatting
function IntegerInput({ value, onChange, placeholder, style }) {
  return (
    <input
      type="text" inputMode="numeric"
      value={value || ""}
      placeholder={placeholder || "0"}
      onChange={e => onChange(e.target.value.replace(/\D/g, ""))}
      style={style}
    />
  );
}

// Reusable percent input: strips %, stores raw number
function PercentInput({ value, onChange, placeholder, style, disabled }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <input
        type="text" inputMode="decimal"
        value={value || ""}
        placeholder={placeholder || "0.00"}
        disabled={disabled}
        onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{ ...style, textAlign: "right" }}
      />
      <span style={{ marginLeft: 3, fontWeight: 700, color: "#475569", flexShrink: 0 }}>%</span>
    </div>
  );
}

function resolveAssignee(role, teamId) {
  if (!role) return "";
  // If it looks like a real name rather than a role, pass it through unchanged
  // (handles legacy data where names were stored directly)
  if (!TASK_ROLES.includes(role)) return role;
  const team = TEAMS[teamId];
  if (!team) return "";
  const member = team.members.find(m => m.role === role);
  return member ? member.name : "";
}

const MARKET_SIZES = ["ACA", "Mid-Market", "Large"];

const CARRIERS = [
  "Aetna","Anthem","BCBSIL","BCBSMI","BCBSND","BCBSTX","BCBSTN","BCBS ?",
  "CareFirst","Cigna","Kaiser","UHC","UMR","Dearborn/Symetra","Delta Dental",
  "Guardian","MetLife","Mutual of Omaha","Principal","Sun Life","Unum","VSP",
];

const FUNDING_METHODS = ["Fully Insured","Self-Funded","Level-Funded"];

const BENEFITS_SCHEMA = [
  {
    id: "medical", label: "Medical",
    children: [
      { id: "medical_ppo", label: "PPO" },
      { id: "medical_hmo", label: "HMO" },
      { id: "medical_hsa", label: "HSA" },
    ],
  },
  {
    id: "dental", label: "Dental",
    children: [
      { id: "dental_ppo_contributory", label: "PPO – Contributory" },
      { id: "dental_ppo_voluntary", label: "PPO – Voluntary" },
      { id: "dental_dmo_contributory", label: "DMO – Contributory" },
      { id: "dental_dmo_voluntary", label: "DMO – Voluntary" },
    ],
  },
  {
    id: "vision", label: "Vision",
    children: [
      { id: "vision_contributory", label: "Contributory" },
      { id: "vision_voluntary", label: "Voluntary" },
    ],
  },
  { id: "basic_life", label: "Basic Life/AD&D", children: [] },
  { id: "vol_life", label: "Voluntary Life/AD&D", children: [] },
  {
    id: "std", label: "Short Term Disability (STD)",
    children: [
      { id: "std_employer", label: "Employer-Paid" },
      { id: "std_voluntary", label: "Voluntary" },
      { id: "std_contributory", label: "Contributory" },
    ],
  },
  { id: "nydbl_pfl", label: "NYDBL & PFL", children: [] },
  {
    id: "ltd", label: "Long Term Disability (LTD)",
    children: [
      { id: "ltd_employer", label: "Employer-Paid" },
      { id: "ltd_voluntary", label: "Voluntary" },
      { id: "ltd_contributory", label: "Contributory" },
    ],
  },
  {
    id: "worksite", label: "Worksite Benefits",
    children: [
      { id: "worksite_ci", label: "Critical Illness" },
      { id: "worksite_cancer", label: "Cancer" },
      { id: "worksite_accident", label: "Personal Accident" },
      { id: "worksite_hospital", label: "Hospital Indemnity" },
    ],
  },
  {
    id: "fsa", label: "FSA",
    children: [
      { id: "fsa_health", label: "Health FSA" },
      { id: "fsa_limited", label: "Limited Purpose FSA" },
      { id: "fsa_dependent", label: "Dependent Care FSA" },
      { id: "fsa_transport", label: "Transportation FSA" },
    ],
  },
  { id: "hsa_funding", label: "HSA Funding", children: [] },
  { id: "hra", label: "HRA", children: [] },
  { id: "eap", label: "EAP", children: [] },
  { id: "telehealth", label: "Telehealth", children: [] },
  { id: "identity_theft", label: "Identity Theft", children: [] },
  { id: "prepaid_legal", label: "Prepaid Legal", children: [] },
  { id: "pet_insurance", label: "Pet Insurance", children: [] },
];

const COMPLIANCE_TASKS = [
  { id: "aca_filing",  label: "ACA Filing",                   dueFn: "aca" },
  { id: "rxdc",        label: "RxDC Filing",                  dueFn: "rxdc" },
  { id: "medicare_d",  label: "Medicare Part D Disclosure",   dueFn: "medicare" },
  { id: "pcori",       label: "PCORI Filing",                 dueFn: "pcori" },
  { id: "form5500",    label: "5500 Filing",                  dueFn: "form5500" },
];

const PRERENEWAL_TASKS = [
  { id: "renewal_dl",    label: "Renewal Download" },
  { id: "bills_dl",      label: "Bills Download" },
  { id: "sbc_dl",        label: "SBC Download" },
  { id: "blue_insights", label: "Blue Insights Download" },
  { id: "data_sheet",    label: "Data Sheet Preparation", acaOnly: true },
  { id: "census",        label: "Request/Download Census" },
  { id: "med_rfp",       label: "Prepare/Send Medical RFP", hasRfpCarriers: true },
  { id: "anc_rfp",       label: "Prepare/Send Ancillary RFP", hasAncRfpCarriers: true },
  { id: "exhibits",      label: "Prepare Exhibits", hasExhibitType: true },
];

// OE Material tasks — generated when a material type is selected
const OE_MATERIAL_TASKS = [
  { id: "oet_eguide",     label: "Prepare E-Guide",           material: "eguide" },
  { id: "oet_paper",      label: "Prepare Paper Guide",        material: "paper" },
  { id: "oet_memo",       label: "Prepare Memo",               material: "memo" },
  { id: "oet_workbook_en",label: "Renewal Workbook (EN)",      material: "si_en" },
  { id: "oet_workbook_ub",label: "Plan Renewal (UB)",          material: "si_ub" },
  { id: "oet_form",       label: "Prepare Enrollment Form",    material: "form" },
  { id: "oet_translation",label: "Translation",                material: "translation" },
];

const ALL_MEMBERS = ["Mary","Kia","Danielle","Renata"];
// Team-filtered member lists
const INDIA_MEMBERS  = ["Mary","Kia","Renata"];    // no Danielle
const JULIET_MEMBERS = ["Danielle","Kia","Renata"]; // no Mary

const TASK_STATUSES = ["Not Started", "In Progress", "Complete", "N/A"];

const STATUS_STYLES = {
  "Not Started": { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
  "In Progress": { bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
  "Complete":    { bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  "N/A":         { bg: "#f1f5f9", text: "#94a3b8", dot: "#cbd5e1" },
};

// Each task stored as { status, assignee, dueDate }
function emptyTask(overrides) { 
  return { status: "Not Started", assignee: "", dueDate: "", completedDate: "", notes: "", followUps: [], ...overrides }; 
}
function emptyTaskMap(tasks) {
  return Object.fromEntries(tasks.map(t => [t.id, emptyTask()]));
}

// US Federal Holidays (fixed + floating) for a given year
function federalHolidays(year) {
  const holidays = new Set();
  function add(d) { holidays.add(d.toISOString().split("T")[0]); }
  function nthDay(y, m, nth, dow) { // nth weekday (1=Mon..0=Sun) of month
    let d = new Date(y, m, 1), count = 0;
    while (true) { if (d.getDay() === dow) { count++; if (count === nth) return d; } d.setDate(d.getDate() + 1); }
  }
  function lastMon(y, m) {
    let d = new Date(y, m + 1, 0);
    while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
    return d;
  }
  // New Year's Day
  add(new Date(year, 0, 1));
  // MLK Day: 3rd Monday of January
  add(nthDay(year, 0, 3, 1));
  // Presidents Day: 3rd Monday of February
  add(nthDay(year, 1, 3, 1));
  // Memorial Day: last Monday of May
  add(lastMon(year, 4));
  // Juneteenth
  add(new Date(year, 5, 19));
  // Independence Day
  add(new Date(year, 6, 4));
  // Labor Day: 1st Monday of September
  add(nthDay(year, 8, 1, 1));
  // Columbus Day: 2nd Monday of October
  add(nthDay(year, 9, 2, 1));
  // Veterans Day
  add(new Date(year, 10, 11));
  // Thanksgiving: 4th Thursday of November
  add(nthDay(year, 10, 4, 4));
  // Christmas
  add(new Date(year, 11, 25));
  return holidays;
}

// Advance a date string to the next business day if it falls on a weekend or holiday
function nextBizDay(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T12:00:00");
  const holidays = { ...Object.fromEntries([...federalHolidays(d.getFullYear())].map(h => [h, true])),
                     ...Object.fromEntries([...federalHolidays(d.getFullYear() + 1)].map(h => [h, true])) };
  while (d.getDay() === 0 || d.getDay() === 6 || holidays[d.toISOString().split("T")[0]]) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

// Add N business days to a date string, skipping weekends and federal holidays
function addBizDays(dateStr, n) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T12:00:00");
  const holidays = { ...Object.fromEntries([...federalHolidays(d.getFullYear())].map(h => [h, true])),
                     ...Object.fromEntries([...federalHolidays(d.getFullYear() + 1)].map(h => [h, true])) };
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6 && !holidays[d.toISOString().split("T")[0]]) added++;
  }
  return d.toISOString().split("T")[0];
}

// Move date to the PREVIOUS business day (for "due before" dates)
function prevBizDay(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T12:00:00");
  const holidays = { ...Object.fromEntries([...federalHolidays(d.getFullYear())].map(h => [h, true])),
                     ...Object.fromEntries([...federalHolidays(d.getFullYear() - 1)].map(h => [h, true])) };
  while (d.getDay() === 0 || d.getDay() === 6 || holidays[d.toISOString().split("T")[0]]) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

// Adjust a date string for weekends: Saturday → Friday, Sunday → Monday
function adjustWeekend(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  if (day === 6) { d.setDate(d.getDate() - 1); } // Saturday -> Friday
  if (day === 0) { d.setDate(d.getDate() + 1); } // Sunday -> Monday
  return d.toISOString().split("T")[0];
}

// Compute a due date from an anchor date + a DDR rule { direction, days }
function computeDueDate(rule, anchorDateStr) {
  if (!anchorDateStr || !rule || rule.days == null) return "";
  const d = new Date(anchorDateStr + "T12:00:00");
  const offset = rule.direction === "after" ? rule.days : -rule.days;
  d.setDate(d.getDate() + offset);
  return adjustWeekend(d.toISOString().split("T")[0]);
}

// Resolve an anchor id to an actual date string from the client record
function getAnchorDate(anchorId, client) {
  switch (anchorId) {
    case "renewal":          return client.renewalDate || "";
    case "renewal_receipt":  return (client.renewalReceived || {}).date || "";
    case "decision_receipt": return client.decisionsReceivedDate || "";
    case "oe_start":         return (client.openEnrollment || {}).oeStartDate || "";
    case "oe_end":           return (client.openEnrollment || {}).oeEndDate || "";
    case "plan_year_end": {
      if (!client.renewalDate) return "";
      const d = new Date(client.renewalDate + "T12:00:00");
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    }
    default: return "";
  }
}

// Apply DDR-based due dates to all pre-renewal + compliance + OE tasks.
// Only overwrites dates that are blank or were previously auto-calculated
// (tracked via _ddrDue field so manual edits are preserved).
function applyDueDateRulesToClient(clientData, tasksDb, dueDateRules) {
  if (!tasksDb || !dueDateRules || !clientData) return clientData;
  let updated = { ...clientData };

  const taskGroups = [
    { group: "preRenewal", defs: PRERENEWAL_TASKS.map(t => ({ ...t, dbId: "t_" + t.id })) },
    { group: "compliance", defs: COMPLIANCE_TASKS.map(t => ({ ...t, dbId: "t_" + t.id })) },
  ];

  taskGroups.forEach(({ group, defs }) => {
    const groupData = { ...(updated[group] || {}) };
    let changed = false;
    defs.forEach(def => {
      const tmpl = tasksDb.find(t => t.id === def.dbId) || tasksDb.find(t => t.id === def.id);
      if (!tmpl || !tmpl.dueDateRule) return;
      // Apply custom DDR rules — also allow built-in offset rules (renewal_minus_N) to calculate
      const rule = dueDateRules.find(r => r.id === tmpl.dueDateRule);
      if (!rule) return;
      // Skip complex built-ins (aca, rxdc, etc.) that have their own calculators
      if (rule.builtin && !["renewal_minus_90","renewal_minus_60","renewal_minus_30"].includes(rule.id) && rule.days == null) return;
      const anchorDate = getAnchorDate(rule.anchor, clientData);
      if (!anchorDate) return;
      const newDue = computeDueDate(rule, anchorDate);
      if (!newDue) return;
      const existing = groupData[def.id];
      const existingObj = (typeof existing === "object" && existing)
        ? existing : { status: existing || "Not Started", assignee: "", dueDate: "", completedDate: "" };
      const currentDue = existingObj.dueDate || "";
      const prevAuto  = existingObj._ddrDue  || "";
      if (currentDue === "" || currentDue === prevAuto) {
        groupData[def.id] = { ...existingObj, dueDate: newDue, _ddrDue: newDue };
        changed = true;
      }
    });
    if (changed) updated = { ...updated, [group]: groupData };
  });

  // OE tasks
  const oe = updated.openEnrollment || {};
  const oeTasks = { ...(oe.tasks || {}) };
  let oeChanged = false;
  OE_MATERIAL_TASKS.forEach(def => {
    const tmpl = tasksDb.find(t => t.id === "t_" + def.id) || tasksDb.find(t => t.id === def.id);
    if (!tmpl || !tmpl.dueDateRule) return;
    const rule = dueDateRules.find(r => r.id === tmpl.dueDateRule);
    if (!rule) return;
    if (rule.builtin && !["renewal_minus_90","renewal_minus_60","renewal_minus_30"].includes(rule.id) && rule.days == null) return;
    const anchorDate = getAnchorDate(rule.anchor, clientData);
    if (!anchorDate) return;
    const newDue = computeDueDate(rule, anchorDate);
    if (!newDue) return;
    const existing = oeTasks[def.id];
    const existingObj = (typeof existing === "object" && existing)
      ? existing : { status: "Not Started", assignee: "", dueDate: "", completedDate: "" };
    const currentDue = existingObj.dueDate || "";
    const prevAuto  = existingObj._ddrDue  || "";
    if (currentDue === "" || currentDue === prevAuto) {
      oeTasks[def.id] = { ...existingObj, dueDate: newDue, _ddrDue: newDue };
      oeChanged = true;
    }
  });
  if (oeChanged) updated = { ...updated, openEnrollment: { ...oe, tasks: oeTasks } };

  // Helper: apply a DDR to a single task object, respecting manual overrides
  function applyRuleToTask(existing, rule, anchorDate) {
    const newDue = computeDueDate(rule, anchorDate);
    if (!newDue) return existing;
    const existingObj = (typeof existing === "object" && existing)
      ? existing : { status: existing || "Not Started", assignee: "", dueDate: "", completedDate: "" };
    const currentDue = existingObj.dueDate || "";
    const prevAuto   = existingObj._ddrDue  || "";
    if (currentDue === "" || currentDue === prevAuto) {
      return { ...existingObj, dueDate: newDue, _ddrDue: newDue };
    }
    return existingObj;
  }

  function getRuleForTemplate(templateId, tasksDb, dueDateRules) {
    const tmpl = tasksDb.find(t => t.id === templateId) || tasksDb.find(t => t.id === "t_" + templateId);
    if (!tmpl || !tmpl.dueDateRule) return null;
    const rule = dueDateRules.find(r => r.id === tmpl.dueDateRule);
    if (!rule) return null;
    if (rule.builtin && !["renewal_minus_90","renewal_minus_60","renewal_minus_30"].includes(rule.id) && rule.days == null) return null;
    return rule;
  }

  // postOEFixed tasks (elections_received, oe_changes_processed, carrier_bill_audited, lineup_updated, oe_wrapup_email)
  const pof = { ...(updated.postOEFixed || {}) };
  let pofChanged = false;
  const POST_OE_FIXED_IDS = ["elections_received", "oe_changes_processed", "carrier_bill_audited", "lineup_updated", "oe_wrapup_email"];
  POST_OE_FIXED_IDS.forEach(id => {
    const rule = getRuleForTemplate("t_" + id, tasksDb, dueDateRules);
    if (!rule) return;
    const anchorDate = getAnchorDate(rule.anchor, clientData);
    if (!anchorDate) return;
    const updated2 = applyRuleToTask(pof[id], rule, anchorDate);
    if (updated2 !== pof[id]) { pof[id] = updated2; pofChanged = true; }
  });
  if (pofChanged) updated = { ...updated, postOEFixed: pof };

  // renewalMeeting (single object keyed by id "renewalMeeting")
  const rmTmplRule = getRuleForTemplate("t_renewalMeeting", tasksDb, dueDateRules)
    || getRuleForTemplate("renewalMeeting", tasksDb, dueDateRules);
  if (rmTmplRule) {
    const anchorDate = getAnchorDate(rmTmplRule.anchor, clientData);
    if (anchorDate) {
      const rm = updated.renewalMeeting || {};
      const updated2 = applyRuleToTask(rm, rmTmplRule, anchorDate);
      if (updated2 !== rm) updated = { ...updated, renewalMeeting: updated2 };
    }
  }

  // renewalTasksAuto (keyed object: { bps_medical: {...}, ncp_dental: {...}, ... })
  const rta = { ...(updated.renewalTasksAuto || {}) };
  let rtaChanged = false;
  Object.keys(rta).forEach(key => {
    // derive template id from key pattern (bps_X, pcr_X, ncp_X, tl_X)
    const prefix = key.split("_")[0]; // bps | pcr | ncp | tl
    const rule = getRuleForTemplate("t_" + prefix, tasksDb, dueDateRules)
      || getRuleForTemplate(prefix, tasksDb, dueDateRules);
    if (!rule) return;
    const anchorDate = getAnchorDate(rule.anchor, clientData);
    if (!anchorDate) return;
    const updated2 = applyRuleToTask(rta[key], rule, anchorDate);
    if (updated2 !== rta[key]) { rta[key] = updated2; rtaChanged = true; }
  });
  if (rtaChanged) updated = { ...updated, renewalTasksAuto: rta };

  // renewalTasks array
  const rtArr = (updated.renewalTasks || []).map(t => {
    if (!t.templateId) return t;
    const rule = getRuleForTemplate(t.templateId, tasksDb, dueDateRules);
    if (!rule) return t;
    const anchorDate = getAnchorDate(rule.anchor, clientData);
    if (!anchorDate) return t;
    return applyRuleToTask(t, rule, anchorDate);
  });
  if (JSON.stringify(rtArr) !== JSON.stringify(updated.renewalTasks || [])) {
    updated = { ...updated, renewalTasks: rtArr };
  }

  // postOETasks array
  const potArr = (updated.postOETasks || []).map(t => {
    if (!t.templateId) return t;
    const rule = getRuleForTemplate(t.templateId, tasksDb, dueDateRules);
    if (!rule) return t;
    const anchorDate = getAnchorDate(rule.anchor, clientData);
    if (!anchorDate) return t;
    return applyRuleToTask(t, rule, anchorDate);
  });
  if (JSON.stringify(potArr) !== JSON.stringify(updated.postOETasks || [])) {
    updated = { ...updated, postOETasks: potArr };
  }

  return updated;
}

// Pre-fill Kia + 90-days-before-renewal for SBC, renewal download, bills tasks
function defaultPreRenewalTasks(renewalDate, marketSize, teamId, tasksDb) {
  const tasks = emptyTaskMap(PRERENEWAL_TASKS);

  // Resolve assignee for a given pre-renewal task id using task DB role, fallback to coordinator
  function assigneeFor(id) {
    const dbTask = (tasksDb || []).find(t => t.id === "t_" + id) ||
                   (tasksDb || []).find(t => t.id === id);
    const role = dbTask?.defaultAssignee || "";
    return role ? resolveAssignee(role, teamId) : getCoordinator(teamId);
  }

  if (renewalDate) {
    const dt = new Date(renewalDate + "T12:00:00");
    dt.setDate(dt.getDate() - 90);
    const due = prevBizDay(dt.toISOString().split("T")[0]);
    ["renewal_dl", "sbc_dl", "bills_dl", "blue_insights", "census"].forEach(id => {
      tasks[id] = emptyTask({ assignee: assigneeFor(id), dueDate: due });
    });
    if (marketSize === "ACA") {
      tasks["data_sheet"] = emptyTask({ assignee: assigneeFor("data_sheet"), dueDate: due });
    }
  } else {
    ["renewal_dl", "sbc_dl", "bills_dl", "blue_insights", "census"].forEach(id => {
      tasks[id] = emptyTask({ assignee: assigneeFor(id) });
    });
  }
  return tasks;
}

// Compute compliance due dates from renewal date string "YYYY-MM-DD"
// Returns { aca, rxdc, medicare, pcori, form5500 } as "YYYY-MM-DD" strings or ""
function complianceDueDates(renewalDate) {
  if (!renewalDate) return {};
  const [y, m] = renewalDate.split("-").map(Number);
  // Plan year end = day before renewal (prior year end)
  const planYearEnd = new Date(y, m - 1, 0); // last day of month before renewal
  const planYear = planYearEnd.getFullYear();

  function fmt(d) {
    return d.toISOString().split("T")[0];
  }

  // ACA / 1095: March 31 following plan year — use next biz day if weekend/holiday
  const aca = nextBizDay(fmt(new Date(planYear + 1, 2, 31)));

  // RxDC: June 1 following plan year
  const rxdc = nextBizDay(fmt(new Date(planYear + 1, 5, 1)));

  // Medicare Part D: October 15 before plan year starts — use prev biz day
  const medicare = prevBizDay(fmt(new Date(y - 1, 9, 15)));

  // PCORI: July 31 following plan year
  const pcori = nextBizDay(fmt(new Date(planYear + 1, 6, 31)));

  // 5500: end of 7th month after plan year ends — use prev biz day (last day of month)
  const form5500Date = new Date(planYearEnd);
  form5500Date.setMonth(form5500Date.getMonth() + 7);
  const form5500 = prevBizDay(fmt(new Date(form5500Date.getFullYear(), form5500Date.getMonth() + 1, 0)));

  return { aca, rxdc, medicare, pcori, form5500 };
}

function newClient(tasksDb) {
  return {
    id: Date.now(),
    name: "",
    renewalDate: "",
    marketSize: "ACA",
    team: "India",
    benefits: {},
    benefitActive: {},          // { cat.id: true/false } — is benefit type offered?
    benefitCarriers: {},        // { cat.id: "Carrier Name" }
    benefitEffectiveDates: {},  // { cat.id: "YYYY-MM-DD" }
    carriers: [],
    fundingMethod: "Fully Insured",
    totalEligible: "",
    medicalEnrolled: "",
    annualRevenue: "",
    employerType: "",
    taxId: "",
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
    sic: "",
    numLocations: "",
    benchmarkingType: "",
    addlContactName: "",
    addlContactTitle: "",
    addlContactEmail: "",
    addlContactPhone: "",
    contactName: "",
    contactTitle: "",
    contactEmail: "",
    contactPhone: "",
    mainPhone: "",
    natureOfBusiness: "",
    affiliatedEmployers: "",
    benefitAdminSystem: "",
    ediEstablished: "",
    corporateStructure: "",
    payrollSystem: "",
    payrollFrequency: "",
    salesPerson: "",
    ratingRegion: "",
    lead: "",
    clientStatus: "Active",
    clientStatusDate: "",
    groupSitus: "",
    continuation: [],
    cobraVendor: "",
    cobraSIPaid: false,
    medicareEligibility: [],
    renewalReceived: { received: false, date: "" },
    decisionsReceivedDate: "",
    rateRelief: { requested: false, requestedDate: "", received: false, receivedDate: "", pct: "" },
    renewalTrackerUpdated: false,
    renewalTrackerUpdatedDate: "",
    carrierChangeTrackerUpdated: false,
    carrierChangeTrackerUpdatedDate: "",
    ancillaryRenewalReceived: {},
    compliance: emptyTaskMap(COMPLIANCE_TASKS),
    preRenewal: defaultPreRenewalTasks("", "ACA", "India", tasksDb),
    openEnrollment: {
      oeStartDate: "", oeEndDate: "",
      commType: "", oeType: "",
      materials: {},
      enrollMethod: "",
      translationNeeded: false,
      tasks: {},
    },
    miscTasks: [],
    transactions: [],      // [{ id, label, memberName, changeType, receivedDate, status, assignee, dueDate, completedDate, notes, followUps }]
    postOETasks: [],
    ongoingTasks: {},   // { taskId: { status, assignee, lastCompleted, nextDue, notes } }
    planYears: [],      // [ { id, archivedAt, effectiveFrom, effectiveTo, notes, correctionNotes, ...snapshot } ]
    postOEFixed: {},
    employeeClasses: [],
    renewalTasks: [],
    renewalTasksAuto: {},    // { taskKey: { status, assignee, dueDate, completedDate, notes } }
    renewalMeeting: { status: "Not Started", assignee: "", dueDate: "", completedDate: "", notes: "", meetingType: "", virtualPlatform: "", meetingDate: "", meetingTime: "" },
    benefitNotes: {},
    benefitPolicyNumbers: {},
    benefitEnrolled: {},
    benefitRates: {},          // { cat.id: { ee, es, ec, ff } } — PEPM rates per coverage tier
    benefitPlans: {},         // { cat.id: [ { name, type, groupNumber } ] }
    benefitDecision: {},      // { cat.id: "renew_as_is"|"change_plans"|"change_carrier"|"" }
    benefitCommissions: {},   // { cat.id: { type: "PEPM"|"Flat %"|"Graded"|"", amount: "" } }
    bundledDiscount: false,   // Medical only
    bundledDiscountPct: "",   // Medical only
    benefitNewCarrier: {},    // { cat.id: "New Carrier Name" }
    notes: "",
  };
}

// Flat list of all benefit leaf nodes
const BENEFIT_LEAVES = BENEFITS_SCHEMA.flatMap(cat =>
  cat.children.length > 0
    ? cat.children.map(ch => ({ ...ch, category: cat.label }))
    : [{ ...cat, category: cat.label }]
);

// All carriers — full list always available, with suggested defaults per benefit type
const ALL_CARRIERS = [
  "Aetna","Anthem","BCBSIL","BCBSMI","BCBSND","BCBSTX","BCBSTN","BCBS ?",
  "CareFirst","Cigna","Kaiser","UHC","UMR",
  "Dearborn/Symetra","Delta Dental","Guardian","MetLife","Mutual of Omaha",
  "Principal","Sun Life","Unum","VSP",
];

// Suggested/top carriers shown first per benefit type, then rest appended
const CARRIER_SUGGESTIONS = {
  medical:  ["Aetna","Anthem","BCBSIL","BCBSMI","BCBSND","BCBSTX","BCBSTN","BCBS ?","CareFirst","Cigna","Kaiser","UHC","UMR"],
  dental:   ["Delta Dental","Guardian","MetLife","Mutual of Omaha","Principal","Sun Life","Unum"],
  vision:   ["VSP","Guardian","MetLife","Principal","Unum"],
  life:     ["Dearborn/Symetra","Guardian","MetLife","Mutual of Omaha","Principal","Sun Life","Unum"],
  other:    ["Guardian","MetLife","Principal","Sun Life","Unum"],
};

function carriersForBenefit(benefitId) {
  // Medical only shows medical carriers — no life/ancillary carriers
  if (benefitId === "medical" || benefitId.startsWith("medical_")) {
    return CARRIER_SUGGESTIONS.medical;
  }
  let suggested;
  if (benefitId.startsWith("dental"))  suggested = CARRIER_SUGGESTIONS.dental;
  else if (benefitId.startsWith("vision"))  suggested = CARRIER_SUGGESTIONS.vision;
  else if (benefitId.startsWith("basic_life") || benefitId.startsWith("vol_life") ||
           benefitId.startsWith("std") || benefitId.startsWith("ltd")) suggested = CARRIER_SUGGESTIONS.life;
  else suggested = CARRIER_SUGGESTIONS.other;
  // Return suggested first, then remaining carriers not already in suggested
  const rest = ALL_CARRIERS.filter(c => !suggested.includes(c));
  return [...suggested, ...rest];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

// Parse a revenue string like "$1,500,000", "1.5M", "1500000" → number
function parseRevenue(str) {
  if (!str) return 0;
  const s = String(str).replace(/[$,\s]/g, "").toUpperCase();
  if (s.endsWith("M")) return parseFloat(s) * 1000000 || 0;
  if (s.endsWith("K")) return parseFloat(s) * 1000 || 0;
  return parseFloat(s) || 0;
}

// Format a dollar amount compactly: 1500000 → "$1.5M", 250000 → "$250K"
function formatRevenue(n) {
  if (!n) return "$0";
  if (n >= 1000000) return `$${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 2)}M`;
  if (n >= 1000)     return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `$${n.toLocaleString()}`;
}

const ROLE_ORDER = ["VP", "Team Lead", "Account Executive", "Account Manager", "Account Coordinator"];
function sortMembers(members) {
  return [...(members || [])].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role);
    const bi = ROLE_ORDER.indexOf(b.role);
    // Known roles sort by index; unknown roles go to the end
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    return av - bv;
  });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / 86400000);
}

function renewalBadge(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  if (d < 0) return { label: "Overdue", bg: "#fee2e2", text: "#991b1b" };
  if (d <= 30) return { label: `${d}d`, bg: "#fef3c7", text: "#92400e" };
  if (d <= 90) return { label: `${d}d`, bg: "#dbeafe", text: "#1e40af" };
  return { label: `${d}d`, bg: "#f0fdf4", text: "#166534" };
}

function completionPct(taskMap) {
  const vals = Object.values(taskMap);
  if (!vals.length) return 0;
  const done = vals.filter(v => {
    const s = typeof v === "object" ? v?.status : v;
    return s === "Complete" || s === "N/A";
  }).length;
  return Math.round((done / vals.length) * 100);
}

function getTaskStatus(t) {
  if (!t) return "Not Started";
  return typeof t === "object" ? (t.status || "Not Started") : t;
}

// Look up a task's label from the live task DB (matched by "t_" + id or id directly).
// Falls back to the hardcoded label if not found — ensures client records always
// reflect the current name set in the task templates.
function getLabelForTask(taskId, tasksDb, fallbackLabel) {
  if (!tasksDb || !tasksDb.length) return fallbackLabel;
  const match = tasksDb.find(td => td.id === "t_" + taskId) ||
                tasksDb.find(td => td.id === taskId);
  return match ? match.label : fallbackLabel;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ pct }) {
  const color = pct === 100 ? "#22c55e" : pct >= 60 ? "#3b82f6" : "#f59e0b";
  return (
    <div style={{ background: "#e2e8f0", borderRadius: 99, height: 6, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width .3s" }} />
    </div>
  );
}

function Badge({ label, bg, text }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 99,
      fontSize: 11, fontWeight: 700, background: bg, color: text, letterSpacing: ".3px",
    }}>{label}</span>
  );
}

function StatusSelect({ value, onChange }) {
  // value may be a plain string (legacy) or a task object — normalize it
  const statusStr = (value && typeof value === "object") ? (value.status || "Not Started") : (value || "Not Started");
  const s = STATUS_STYLES[statusStr] || STATUS_STYLES["Not Started"];
  return (
    <select
      value={statusStr}
      onChange={e => onChange(e.target.value)}
      style={{
        background: s.bg, color: s.text, border: "none", borderRadius: 6,
        padding: "3px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {TASK_STATUSES.map(st => <option key={st}>{st}</option>)}
    </select>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
      color: "#64748b", borderBottom: "2px solid #e2e8f0", paddingBottom: 6,
      marginBottom: 12, marginTop: 20,
    }}>{children}</div>
  );
}

// ── Collapsible Section Header ──────────────────────────────────────────────


function CollapseHeader({ id, title, accent, collapsed, onToggle }) {
  const isOpen = !collapsed[id];
  return (
    <div onClick={() => onToggle(id)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      cursor: "pointer", userSelect: "none",
      fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase",
      color: accent || "#3e5878",
      borderBottom: `2px solid ${accent || "#507c9c"}`,
      paddingBottom: 6, marginBottom: isOpen ? 12 : 0, marginTop: 20,
    }}>
      <span>{title}</span>
      <span style={{ fontSize: 14, fontWeight: 400, letterSpacing: 0 }}>{isOpen ? "▲" : "▼"}</span>
    </div>
  );
}

// Apply pre-renewal auto-N/A rules to a client record (pure function, returns new object)
function applyPreRenewalRules(fixed) {
  const pr = { ...(fixed.preRenewal || {}) };

  // renewal_dl → N/A for Mid-Market and Large
  if (["Mid-Market", "Large"].includes(fixed.marketSize)) {
    const t = pr.renewal_dl;
    const cur = (t && typeof t === "object") ? t : { status: t || "Not Started", assignee: "", dueDate: "", completedDate: "" };
    if (cur.status !== "N/A") pr.renewal_dl = { ...cur, status: "N/A" };
  }

  // blue_insights → N/A if medicalEnrolled < 50 OR medical carrier is not BCBSIL
  const enrolled = Number(fixed.medicalEnrolled);
  const medCarrier = (fixed.benefitCarriers || {}).medical || (fixed.carriers || [])[0] || "";
  const needsBlueInsightsNA = (fixed.medicalEnrolled !== "" && fixed.medicalEnrolled !== undefined && !isNaN(enrolled) && enrolled < 50)
    || (medCarrier !== "" && medCarrier !== "BCBSIL");
  if (needsBlueInsightsNA) {
    const t = pr.blue_insights;
    const cur = (t && typeof t === "object") ? t : { status: t || "Not Started", assignee: "", dueDate: "", completedDate: "" };
    if (cur.status !== "N/A") pr.blue_insights = { ...cur, status: "N/A" };
  }

  return { ...fixed, preRenewal: pr };
}


// ── Save Button with confirmation flash ────────────────────────────────────────

function SaveButton({ onSave }) {
  const [saved, setSaved] = useState(false);
  function handleSave() {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }
  return (
    <button onClick={handleSave} style={{
      ...btnPrimary,
      background: saved ? "linear-gradient(135deg,#54652d,#7a8a3d)" : "linear-gradient(135deg,#3e5878,#507c9c)",
      transition: "background .3s",
      minWidth: 110,
    }}>
      {saved ? "✓ Saved" : "Save Client"}
    </button>
  );
}

// ── Client Form Modal ─────────────────────────────────────────────────────────


// Reusable follow-up block — renders inside any task card
function FollowUpBlock({ followUps, onAdd, onChangeDate, onChangeNote, onRemove }) {
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".6px" }}>
          Follow-ups {followUps.length > 0 ? `(${followUps.length})` : ""}
        </span>
        <button type="button" onClick={onAdd}
          style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#dbeafe",
            border: "none", borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}>
          + Follow-up
        </button>
      </div>
      {followUps.map((fu, fi) => (
        <div key={fu.id || fi} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
          <input type="date" value={fu.date || ""}
            onChange={e => onChangeDate(fi, e.target.value)}
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "3px 6px",
              fontSize: 11, color: "#0f172a", background: "#fff", fontFamily: "inherit",
              width: 140, flexShrink: 0 }} />
          <input type="text" value={fu.note || ""}
            onChange={e => onChangeNote(fi, e.target.value)}
            placeholder="Follow-up note..."
            style={{ border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "3px 6px",
              fontSize: 11, color: "#0f172a", background: "#fff", fontFamily: "inherit", flex: 1 }} />
          <button type="button" onClick={() => onRemove(fi)}
            style={{ padding: "3px 6px", borderRadius: 5, fontSize: 10, border: "1.5px solid #fca5a5",
              background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  );
}

function ClientModal({ client, onSave, onClose, tasksDb, onSaveCarrier, dueDateRules, benefitsDb, carriersData, currentUser }) {
  // Helper: fire-and-forget audit log entry
  function logChange(p, category, taskLabel, field, oldValue, newValue) {
    if (oldValue === newValue) return;
    insertAuditLog({
      clientId: p.id, clientName: p.name,
      userName: currentUser?.name || "Unknown", userRole: currentUser?.role || "",
      category, taskLabel, field,
      oldValue: oldValue ?? "", newValue: newValue ?? "",
    });
  }
  const [data, setData] = useState(() => {
    const base = JSON.parse(JSON.stringify(client));
    return applyDueDateRulesToClient(base, tasksDb, dueDateRules);
  });
  const [pendingCarrier, setPendingCarrier] = useState({}); // { "med_N": "typed text", "anc_N": "typed text" }
  const [otherCarrierText, setOtherCarrierText] = useState({}); // { cat.id: "typed text" } — local to avoid re-render focus loss
  const [archivePanel, setArchivePanel] = useState(false);   // show/hide archive panel
  const [archiveForm, setArchiveForm]   = useState({ effectiveFrom: "", effectiveTo: "", notes: "" });
  const [historyTab, setHistoryTab]     = useState(false);   // toggle history view
  const [correcting, setCorrecting]       = useState(null);   // planYear.id being corrected
  const [correctionNote, setCorrectionNote]   = useState("");
  const [correctionEdits, setCorrectionEdits] = useState({});  // partial snapshot edits while correcting

  function buildSnapshot() {
    return {
      marketSize:           data.marketSize,
      fundingMethod:        data.fundingMethod,
      benefitActive:        JSON.parse(JSON.stringify(data.benefitActive  || {})),
      benefitCarriers:      JSON.parse(JSON.stringify(data.benefitCarriers || {})),
      benefitEffectiveDates:JSON.parse(JSON.stringify(data.benefitEffectiveDates || {})),
      benefitPlans:         JSON.parse(JSON.stringify(data.benefitPlans   || {})),
      benefitPolicyNumbers: JSON.parse(JSON.stringify(data.benefitPolicyNumbers || {})),
      benefitCommissions:   JSON.parse(JSON.stringify(data.benefitCommissions || {})),
      employeeClasses:      JSON.parse(JSON.stringify(data.employeeClasses || [])),
    };
  }

  function doArchive(mode) {
    // mode: "rollforward" | "clear"
    const snapshot = buildSnapshot();
    const py = {
      id:            Date.now(),
      archivedAt:    new Date().toISOString().split("T")[0],
      effectiveFrom: archiveForm.effectiveFrom,
      effectiveTo:   archiveForm.effectiveTo,
      notes:         archiveForm.notes,
      correctionNotes: "",
      ...snapshot,
    };

    let newData = { ...data, planYears: [...(data.planYears || []), py] };

    if (mode === "rollforward") {
      // Derive new renewal date: effectiveTo + 1 day (start of new plan year)
      let newRenewalDate = data.renewalDate;
      if (archiveForm.effectiveTo) {
        const d = new Date(archiveForm.effectiveTo + "T12:00:00");
        d.setDate(d.getDate() + 1);
        newRenewalDate = d.toISOString().split("T")[0];
      }

      // Recalculate pre-renewal task due dates for the new renewal date
      const newPreRenewal = defaultPreRenewalTasks(newRenewalDate, data.marketSize, data.team, tasksDb);
      // Preserve existing task status/assignee; only update due dates for tasks not yet started
      const mergedPreRenewal = { ...newPreRenewal };
      Object.entries(data.preRenewal || {}).forEach(([id, existing]) => {
        if (!mergedPreRenewal[id]) return;
        const ex = (typeof existing === "object" && existing) ? existing : { status: existing || "Not Started" };
        // Keep existing entry but update the due date to the new cycle
        mergedPreRenewal[id] = {
          ...ex,
          dueDate: mergedPreRenewal[id].dueDate || ex.dueDate,
          status: "Not Started",
          completedDate: "",
        };
      });

      // Recalculate compliance due dates
      const newCompDates = complianceDueDates(newRenewalDate);
      const dueFnMap = { aca_filing:"aca", rxdc:"rxdc", medicare_d:"medicare", pcori:"pcori", form5500:"form5500" };
      const newCompliance = {};
      Object.entries(data.compliance || {}).forEach(([taskId, existing]) => {
        const base = (typeof existing === "object" && existing)
          ? { ...existing, status: "Not Started", completedDate: "" }
          : { status: "Not Started", assignee: "", dueDate: "", completedDate: "" };
        const key = dueFnMap[taskId];
        newCompliance[taskId] = { ...base, ...(key && newCompDates[key] ? { dueDate: newCompDates[key] } : {}) };
      });

      // Advance each effective date by 1 year
      const advancedEffDates = {};
      Object.entries(snapshot.benefitEffectiveDates || {}).forEach(([catId, d]) => {
        if (!d) { advancedEffDates[catId] = d; return; }
        const dt = new Date(d + "T12:00:00");
        dt.setFullYear(dt.getFullYear() + 1);
        advancedEffDates[catId] = dt.toISOString().split("T")[0];
      });

      newData = {
        ...newData,
        renewalDate:          newRenewalDate,
        fundingMethod:        snapshot.fundingMethod,
        benefitActive:        { ...snapshot.benefitActive },
        benefitCarriers:      { ...snapshot.benefitCarriers },
        benefitEffectiveDates: advancedEffDates,
        benefitPlans:         JSON.parse(JSON.stringify(snapshot.benefitPlans)),
        benefitPolicyNumbers: JSON.parse(JSON.stringify(snapshot.benefitPolicyNumbers)),
        benefitCommissions:   JSON.parse(JSON.stringify(snapshot.benefitCommissions)),
        benefitEnrolled:      JSON.parse(JSON.stringify(snapshot.benefitEnrolled || {})),
        employeeClasses:      JSON.parse(JSON.stringify(snapshot.employeeClasses)),
        preRenewal:           mergedPreRenewal,
        compliance:           newCompliance,
        // Clear renewal decisions — these are plan-year specific
        benefitDecision:      {},
        benefitNewCarrier:    {},
      };
    } else {
      // Clear — wipe benefit/carrier config for fresh start
      newData = {
        ...newData,
        benefitActive: {}, benefitCarriers: {}, benefitEffectiveDates: {},
        benefitPlans: {}, benefitPolicyNumbers: {}, benefitCommissions: {},
        benefitEnrolled: {}, fundingMethod: "Fully Insured",
        employeeClasses: [],
      };
    }

    setData(newData);
    setArchivePanel(false);
    setArchiveForm({ effectiveFrom: "", effectiveTo: "", notes: "" });
    setHistoryTab(true);  // jump to history so they can see it
  }

  function saveCorrection(pyId) {
    if (!correctionNote.trim()) return;
    const logEntry = new Date().toLocaleDateString() + ": " + correctionNote.trim();
    setData(p => ({
      ...p,
      planYears: (p.planYears || []).map(py => {
        if (py.id !== pyId) return py;
        return {
          ...py,
          ...correctionEdits,           // merge any edited snapshot fields
          correctionNotes: (py.correctionNotes ? py.correctionNotes + "\n" : "") + logEntry,
        };
      }),
    }));
    setCorrecting(null);
    setCorrectionNote("");
    setCorrectionEdits({});
  }

  const set = (key, val) => setData(p => ({ ...p, [key]: val }));

  // Re-apply DDR-based due dates whenever an anchor date changes
  function applyDDR(newData) {
    return applyDueDateRulesToClient(newData, tasksDb, dueDateRules);
  }
  function setWithDDR(key, val) {
    setData(p => applyDDR({ ...p, [key]: val }));
  }

  async function lookupZip(city, state) {
    if (!city || !state) return;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 20,
          messages: [{
            role: "user",
            content: `What is the primary zip code for ${city}, ${state}? Reply with ONLY the 5-digit zip code, nothing else.`,
          }],
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const text = (json.content?.[0]?.text || "").trim();
      const match = text.match(/\b\d{5}\b/);
      if (match) setData(p => ({ ...p, zipCode: match[0] }));
    } catch (e) { /* silently ignore */ }
  }

  function toggleBenefit(id) {
    setData(p => ({
      ...p,
      benefits: { ...p.benefits, [id]: !p.benefits[id] },
    }));
  }

  function setBenefitCarrier(benefitId, carrier) {
    setData(p => {
      const updated = { ...p, benefitCarriers: { ...p.benefitCarriers, [benefitId]: carrier } };

      // Auto-populate commission from carrier's commission rules
      if (carrier && carrier !== "__other__" && carriersData) {
        const carrierObj = carriersData.find(c => c.name === carrier);
        const rules = carrierObj?.commissionRules || [];
        if (rules.length > 0) {
          // Map benefitId → display name for rule lookup
          const BENEFIT_ID_TO_NAME = {
            medical: "Medical", dental: "Dental", vision: "Vision",
            basic_life: "Basic Life/AD&D", vol_life: "Vol Life",
            std: "STD", ltd: "LTD", worksite: "Worksite",
            eap: "EAP", telehealth: "Telehealth", fsa: "FSA",
            hsa_funding: "HSA", hra: "HRA", nydbl_pfl: "NYDBL & PFL",
          };
          const benefitName = BENEFIT_ID_TO_NAME[benefitId] || benefitId;
          const market = p.marketSize || "";
          const funding = p.fundingMethod || "";

          // Find best matching rule: most specific match wins
          const match = rules.find(r =>
            (r.benefit === benefitName || r.benefit === "All") &&
            (r.segment === market || r.segment === "All") &&
            (r.fundingMethod === funding || r.fundingMethod === "All") &&
            r.benefit === benefitName && r.segment === market && r.fundingMethod === funding
          ) || rules.find(r =>
            (r.benefit === benefitName || r.benefit === "All") &&
            (r.segment === market || r.segment === "All") &&
            (r.fundingMethod === "All")
          ) || rules.find(r =>
            (r.benefit === benefitName) && r.segment === "All"
          );

          if (match && match.amount) {
            const existingComm = (p.benefitCommissions || {})[benefitId] || {};
            // Only auto-fill if not already set
            if (!existingComm.amount) {
              const withComm = {
                ...updated,
                benefitCommissions: {
                  ...(updated.benefitCommissions || {}),
                  [benefitId]: { type: match.type, amount: match.amount },
                },
              };
              return benefitId === "medical" ? applyPreRenewalRules(withComm) : withComm;
            }
          }
        }
      }

      return benefitId === "medical" ? applyPreRenewalRules(updated) : updated;
    });
  }

  // setTask updates a single field within a task object
  function setTask(group, id, field, val, taskLabel, category) {
    setData(p => {
      const existing = p[group]?.[id];
      const base = (!existing || typeof existing === "string")
        ? { status: existing || "Not Started", assignee: "", dueDate: "" }
        : { ...existing };
      // Capture plannedDueDate on first set
      const plannedDueDate = field === "dueDate" && !base.plannedDueDate && val
        ? val : base.plannedDueDate;
      const updated = { ...base, [field]: val, ...(plannedDueDate ? { plannedDueDate } : {}) };
      // Audit log for tracked fields
      if (["status","dueDate","assignee","completedDate"].includes(field) && base[field] !== val) {
        insertAuditLog({
          clientId:   p.id,
          clientName: p.name,
          userName:   currentUser?.name || "Unknown",
          userRole:   currentUser?.role || "",
          category:   category || group,
          taskLabel:  taskLabel || id,
          field,
          oldValue:   base[field] ?? "",
          newValue:   val ?? "",
        });
      }
      return { ...p, [group]: { ...p[group], [id]: updated } };
    });
  }

  // Ensure task objects are fully hydrated (backwards compat: old tasks were plain strings)
  function getTask(group, id, tasksDb) {
    const t = data[group]?.[id];
    // Resolve default assignee from task DB by matching on task id
    const dbTask = (tasksDb || []).find(td => td.id === "t_" + id) ||
                   (tasksDb || []).find(td => td.id === id);
    const dbRole = dbTask?.defaultAssignee || "";
    const defaultAssignee = resolveAssignee(dbRole, data.team);
    if (!t) return { status: "Not Started", assignee: defaultAssignee, dueDate: "", completedDate: "" };
    if (typeof t === "string") return { status: t, assignee: defaultAssignee, dueDate: "", completedDate: "" };
    // Return all stored fields (preserves extras like exhibitType, rfpCarriers, notes, etc.)
    return { status: "Not Started", assignee: defaultAssignee, dueDate: "", completedDate: "", ...t };
  }

  // OE helpers — work with the new structured openEnrollment object
  const oe = data.openEnrollment || {};

  function setOE(field, val) {
    const OE_ANCHOR_FIELDS = ["oeStartDate", "oeEndDate"];
    if (OE_ANCHOR_FIELDS.includes(field)) {
      setData(p => applyDDR({ ...p, openEnrollment: { ...(p.openEnrollment || {}), [field]: val } }));
    } else {
      setData(p => ({ ...p, openEnrollment: { ...(p.openEnrollment || {}), [field]: val } }));
    }
  }

  function setOEMaterial(mat, val) {
    setData(p => {
      const prev = p.openEnrollment || {};
      return { ...p, openEnrollment: { ...prev, materials: { ...(prev.materials || {}), [mat]: val } } };
    });
  }

  function getOETask(taskId, tasksDb) {
    const t = oe.tasks?.[taskId];
    // Look up default role from task DB; fall back to coordinator for oet_form
    const dbTask = (tasksDb || []).find(td => td.id === "t_" + taskId) ||
                   (tasksDb || []).find(td => td.id === taskId);
    const dbRole = dbTask?.defaultAssignee || "";
    const defaultAssignee = dbRole
      ? resolveAssignee(dbRole, data.team)
      : (taskId === "oet_form" ? getCoordinator(data.team) : "");
    if (!t) return { status: "Not Started", assignee: defaultAssignee, dueDate: "", completedDate: "" };
    if (typeof t === "string") return { status: t, assignee: defaultAssignee, dueDate: "", completedDate: "" };
    return { status: t.status || "Not Started", assignee: t.assignee || defaultAssignee, dueDate: t.dueDate || "", completedDate: t.completedDate || "" };
  }

  function setOETask(taskId, field, val, taskLabel) {
    setData(p => {
      const prev = p.openEnrollment || {};
      const existing = prev.tasks?.[taskId];
      const base = (!existing || typeof existing === "string")
        ? { status: existing || "Not Started", assignee: "", dueDate: "", completedDate: "" }
        : { ...existing };
      const plannedDueDate = field === "dueDate" && !base.plannedDueDate && val
        ? val : base.plannedDueDate;
      const updated = { ...base, [field]: val, ...(plannedDueDate ? { plannedDueDate } : {}) };
      if (["status","dueDate","assignee","completedDate"].includes(field) && base[field] !== val) {
        insertAuditLog({
          clientId:   p.id,
          clientName: p.name,
          userName:   currentUser?.name || "Unknown",
          userRole:   currentUser?.role || "",
          category:   "Open Enrollment",
          taskLabel:  taskLabel || taskId,
          field,
          oldValue:   base[field] ?? "",
          newValue:   val ?? "",
        });
      }
      return { ...p, openEnrollment: { ...prev, tasks: { ...(prev.tasks || {}), [taskId]: updated } } };
    });
  }

  // Derive which tasks are active based on current OE selections
  const activeMaterialTasks = OE_MATERIAL_TASKS.filter(t => {
    if (t.material === "eguide") return !!(oe.materials || {}).eguide;
    if (t.material === "paper")  return !!(oe.materials || {}).paper;
    if (t.material === "memo")   return !!(oe.materials || {}).memo;
    if (t.material === "si_en")  return oe.enrollMethod === "si_en";
    if (t.material === "si_ub")  return oe.enrollMethod === "si_ub";
    if (t.material === "form")   return oe.enrollMethod === "form";
    if (t.material === "translation") return !!oe.translationNeeded;
    return false;
  });

  // Auto-populate compliance due dates from renewal date
  function autoFillDueDates() {
    if (!data.renewalDate) return;
    const dates = complianceDueDates(data.renewalDate);
    const dueFnMap = { aca_filing:"aca", rxdc:"rxdc", medicare_d:"medicare", pcori:"pcori", form5500:"form5500" };
    setData(p => {
      const newCompliance = { ...p.compliance };
      Object.entries(dueFnMap).forEach(([taskId, key]) => {
        if (!dates[key]) return;
        const existing = p.compliance?.[taskId];
        const base = (!existing || typeof existing === "string")
          ? { status: existing || "Not Started", assignee: "", dueDate: "" }
          : { ...existing };
        newCompliance[taskId] = { ...base, dueDate: dates[key] };
      });
      return { ...p, compliance: newCompliance };
    });
  }

  const teamInfo = TEAMS[data.team];
  const teamMembers = data.team === "India" ? INDIA_MEMBERS : JULIET_MEMBERS;

  // Collapsible section state (still used within tabs)
  const [collapsed, setCollapsed] = useState({
    clientInfo: false, teamAssignment: false, benefitsSection: false,
    preRenewal: false, renewalTasks: false, oe: false, postOE: false,
    compliance: false, misc: false, employeeClasses: false, ongoing: false,
  });
  function toggleSection(id) { setCollapsed(p => ({ ...p, [id]: !p[id] })); }

  // Tab state
  const [activeTab, setActiveTab] = useState("info");
  const [taskTab, setTaskTab] = useState("preRenewal");
  const TABS = [
    { id: "info",        label: "Client Information" },
    { id: "eligibility", label: "Eligibility" },
    { id: "benefits",    label: "Benefits" },
    { id: "tasks",       label: "Tasks" },
  ];
  const TASK_TABS = [
    { id: "preRenewal",   label: "Pre-Renewal",       accent: "#92400e", bg: "#fffbeb", border: "#fde68a" },
    { id: "renewal",      label: "Renewal",            accent: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
    { id: "oe",           label: "Open Enrollment",    accent: "#065f46", bg: "#ecfdf5", border: "#6ee7b7" },
    { id: "postOE",       label: "Post-OE",            accent: "#5b21b6", bg: "#f5f3ff", border: "#c4b5fd" },
    { id: "compliance",   label: "Compliance",         accent: "#9f1239", bg: "#fff1f2", border: "#fda4af" },
    { id: "misc",         label: "Miscellaneous",      accent: "#374151", bg: "#f9fafb", border: "#d1d5db" },
    { id: "transactions", label: "Transactions",       accent: "#9d174d", bg: "#fdf4ff", border: "#f0abfc" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 1000,
        maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,.2)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 28px", borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg,#3e5878,#507c9c)",
          flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", fontFamily: "'Playfair Display',Georgia,serif" }}>
              {data.name || "New Client"}
            </div>
            <div style={{ fontSize: 12, color: "#c8d8e8", marginTop: 2 }}>Client Record</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* History tab toggle */}
            <button onClick={() => { setHistoryTab(h => !h); setArchivePanel(false); }} style={{
              background: historyTab ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
              border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 8,
              padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              📋 History {(data.planYears || []).length > 0 ? `(${data.planYears.length})` : ""}
            </button>
            {/* Archive plan year button */}
            <button onClick={() => {
              const isOpening = !archivePanel;
              setArchivePanel(p => !p);
              setHistoryTab(false);
              // Auto-populate dates when opening: effectiveTo = renewalDate - 1 day,
              // effectiveFrom = renewalDate - 1 year
              if (isOpening && data.renewalDate) {
                const renewalD = new Date(data.renewalDate + "T12:00:00");
                const effTo = new Date(renewalD);
                effTo.setDate(effTo.getDate() - 1);
                const effFrom = new Date(renewalD);
                effFrom.setFullYear(effFrom.getFullYear() - 1);
                setArchiveForm(p => ({
                  ...p,
                  effectiveTo:   p.effectiveTo   || effTo.toISOString().split("T")[0],
                  effectiveFrom: p.effectiveFrom || effFrom.toISOString().split("T")[0],
                }));
              }
            }} style={{
              background: archivePanel ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
              border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 8,
              padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fff",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              🗄 Archive Plan Year
            </button>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, width: 32, height: 32,
              cursor: "pointer", fontSize: 18, color: "#fff", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>
        </div>

        {/* Tab bar */}
        {!historyTab && !archivePanel && (
          <div style={{
            display: "flex", borderBottom: "2px solid #e2e8f0",
            background: "#f8fafc", paddingLeft: 20, flexShrink: 0,
          }}>
            {TABS.map(tab => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{
                padding: "11px 22px", fontSize: 13, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer", border: "none",
                borderBottom: activeTab === tab.id ? "3px solid #3e5878" : "3px solid transparent",
                background: "none",
                color: activeTab === tab.id ? "#3e5878" : "#94a3b8",
                marginBottom: -2, transition: "all .15s",
              }}>{tab.label}</button>
            ))}
          </div>
        )}

        {/* Archive plan year panel */}
        {archivePanel && (
          <div style={{ padding: "16px 28px", background: "#f0f5fa", borderBottom: "2px solid #4a7fa5" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#2d4a6b", marginBottom: 12 }}>
              Archive Current Plan Year
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginBottom: 10 }}>
              <label style={{ ...labelStyle }}>
                Effective From
                <input type="date" value={archiveForm.effectiveFrom}
                  onChange={e => setArchiveForm(p => ({ ...p, effectiveFrom: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 3 }} />
              </label>
              <label style={{ ...labelStyle }}>
                Effective To
                <input type="date" value={archiveForm.effectiveTo}
                  onChange={e => setArchiveForm(p => ({ ...p, effectiveTo: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 3 }} />
              </label>
              <label style={{ ...labelStyle }}>
                Plan Year Notes
                <input type="text" value={archiveForm.notes}
                  onChange={e => setArchiveForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="e.g. Switched FI→LF; added MOO life/vision"
                  style={{ ...inputStyle, marginTop: 3 }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(() => {
                // Preview what the new renewal date will be
                if (!archiveForm.effectiveTo) return null;
                const d = new Date(archiveForm.effectiveTo + "T12:00:00");
                d.setDate(d.getDate() + 1);
                const newDate = d.toISOString().split("T")[0];
                const fmt = s => `${s.slice(5,7)}/${s.slice(8,10)}/${s.slice(0,4)}`;
                return (
                  <div style={{ fontSize: 11, color: "#2d4a6b", background: "#dce8f0",
                    padding: "4px 10px", borderRadius: 6, fontWeight: 600, marginBottom: 8, width: "100%" }}>
                    New renewal date after roll-forward: <strong>{fmt(newDate)}</strong>
                    {" "}· Pre-renewal and compliance task due dates will recalculate automatically.
                  </div>
                );
              })()}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => doArchive("rollforward")} style={{
                background: "linear-gradient(135deg,#2d4a6b,#4a7fa5)", color: "#fff",
                border: "none", borderRadius: 8, padding: "8px 18px",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>✓ Archive & Roll Forward</button>
              <button onClick={() => doArchive("clear")} style={{
                background: "#fff", color: "#dc2626",
                border: "1.5px solid #fca5a5", borderRadius: 8, padding: "8px 18px",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>✕ Archive & Clear All</button>
              <button onClick={() => setArchivePanel(false)} style={{
                background: "none", color: "#64748b",
                border: "none", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
              <span style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginLeft: 4 }}>
                Both options save a snapshot of the current benefits before making changes.
              </span>
            </div>
          </div>
        )}

        {/* Task sub-tab bar — only shown when Tasks tab is active */}
        {!historyTab && !archivePanel && activeTab === "tasks" && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 0,
            borderBottom: "2px solid #e2e8f0", background: "#fff",
            paddingLeft: 20, flexShrink: 0,
          }}>
            {TASK_TABS.map(tt => (
              <button key={tt.id} type="button" onClick={() => setTaskTab(tt.id)} style={{
                padding: "9px 16px", fontSize: 12, fontWeight: 700,
                fontFamily: "inherit", cursor: "pointer", border: "none",
                borderBottom: taskTab === tt.id ? `3px solid ${tt.accent}` : "3px solid transparent",
                background: taskTab === tt.id ? tt.bg : "transparent",
                color: taskTab === tt.id ? tt.accent : "#94a3b8",
                marginBottom: -2, transition: "all .12s", whiteSpace: "nowrap",
              }}>{tt.label}</button>
            ))}
          </div>
        )}

        {/* Body — History view OR normal record */}
        <div style={{ overflow: "auto", overflowX: "hidden", padding: "20px 28px", flex: 1 }}>

          {historyTab ? (
            /* ── Plan Year History ── */
            <div>
              <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800,
                fontSize: 18, color: "#0f172a", marginBottom: 16 }}>Plan Year History</div>
              {(data.planYears || []).length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 20px", color: "#94a3b8",
                  background: "#f8fafc", borderRadius: 12, border: "1.5px dashed #e2e8f0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🗄</div>
                  <div style={{ fontWeight: 700 }}>No archived plan years yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    Click "Archive Plan Year" in the header to save the current plan year before making changes.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[...(data.planYears || [])].reverse().map(py => {
                    const pyOpen = !!collapsed["py_" + py.id];
                    const activeInYear = BENEFITS_SCHEMA.filter(cat => !!(py.benefitActive || {})[cat.id]);
                    const isCorrectingThis = correcting === py.id;
                    return (
                      <div key={py.id} style={{ background: "#fff", borderRadius: 12,
                        border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
                        {/* Plan year card header */}
                        <div onClick={() => setCollapsed(p => ({ ...p, ["py_" + py.id]: !p["py_" + py.id] }))} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "14px 18px", cursor: "pointer", userSelect: "none",
                          background: "#f8fafc",
                        }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                              {py.effectiveFrom && py.effectiveTo
                                ? `${py.effectiveFrom.slice(5,7)}/${py.effectiveFrom.slice(8,10)}/${py.effectiveFrom.slice(0,4)} – ${py.effectiveTo.slice(5,7)}/${py.effectiveTo.slice(8,10)}/${py.effectiveTo.slice(0,4)}`
                                : py.effectiveFrom ? `From ${py.effectiveFrom}` : `Archived ${py.archivedAt}`}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                              {py.marketSize} · {py.fundingMethod} · Archived {py.archivedAt}
                            </div>
                            {py.notes && <div style={{ fontSize: 12, color: "#475569", marginTop: 3, fontStyle: "italic" }}>"{py.notes}"</div>}
                            {py.correctionNotes && (
                              <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 3 }}>
                                📝 Correction on file
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button type="button" onClick={e => { e.stopPropagation(); setCorrecting(isCorrectingThis ? null : py.id); setCorrectionNote(""); }}
                              style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                                cursor: "pointer", fontFamily: "inherit" }}>
                              {isCorrectingThis ? "Cancel" : "✎ Correct"}
                            </button>
                            <span style={{ fontSize: 13, color: "#94a3b8" }}>{pyOpen ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {/* Correction note input */}
                        {isCorrectingThis && (() => {
                          // Merge stored py fields with any in-progress edits
                          const ced = correctionEdits;
                          const effFrom = ced.effectiveFrom  !== undefined ? ced.effectiveFrom  : py.effectiveFrom  || "";
                          const effTo   = ced.effectiveTo    !== undefined ? ced.effectiveTo    : py.effectiveTo    || "";
                          const pyNote  = ced.notes          !== undefined ? ced.notes          : py.notes          || "";
                          const mktSize = ced.marketSize     !== undefined ? ced.marketSize     : py.marketSize     || "";
                          const funding = ced.fundingMethod  !== undefined ? ced.fundingMethod  : py.fundingMethod  || "";
                          const bCarr   = ced.benefitCarriers !== undefined ? ced.benefitCarriers : py.benefitCarriers || {};
                          const bPol    = ced.benefitPolicyNumbers !== undefined ? ced.benefitPolicyNumbers : py.benefitPolicyNumbers || {};
                          const bComm   = ced.benefitCommissions  !== undefined ? ced.benefitCommissions  : py.benefitCommissions  || {};
                          const bEnr    = ced.benefitEnrolled     !== undefined ? ced.benefitEnrolled     : py.benefitEnrolled     || {};
                          const activeInPY = BENEFITS_SCHEMA.filter(cat => !!((ced.benefitActive || py.benefitActive || {})[cat.id]));
                          function setCE(field, val) { setCorrectionEdits(p => ({ ...p, [field]: val })); }
                          return (
                          <div style={{ padding: "14px 18px", background: "#faf5ff",
                            borderTop: "2px solid #a78bfa" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#6d28d9", marginBottom: 10,
                              textTransform: "uppercase", letterSpacing: "1px" }}>
                              ✎ Correcting Plan Year
                            </div>

                            {/* Date range + plan year meta */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Effective From
                                <input type="date" value={effFrom}
                                  onChange={e => setCE("effectiveFrom", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Effective To
                                <input type="date" value={effTo}
                                  onChange={e => setCE("effectiveTo", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Market Size
                                <select value={mktSize} onChange={e => setCE("marketSize", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3, fontSize: 12 }}>
                                  {MARKET_SIZES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Funding Method
                                <select value={funding} onChange={e => setCE("fundingMethod", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3, fontSize: 12 }}>
                                  {FUNDING_METHODS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                              </label>
                            </div>

                            {/* Per-benefit corrections */}
                            {activeInPY.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#6d28d9",
                                  marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>
                                  Benefit Details
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {activeInPY.map(cat => (
                                    <div key={cat.id} style={{ background: "#fff", borderRadius: 8,
                                      padding: "8px 10px", border: "1px solid #e9d5ff" }}>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#4c1d95", marginBottom: 6 }}>
                                        {cat.label}
                                      </div>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                        <label style={{ ...labelStyle, marginTop: 0 }}>
                                          Carrier
                                          <input type="text" value={bCarr[cat.id] || ""}
                                            onChange={e => setCE("benefitCarriers", { ...bCarr, [cat.id]: e.target.value })}
                                            style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                                        </label>
                                        <label style={{ ...labelStyle, marginTop: 0 }}>
                                          Policy #
                                          <input type="text" value={bPol[cat.id] || ""}
                                            onChange={e => setCE("benefitPolicyNumbers", { ...bPol, [cat.id]: e.target.value })}
                                            style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                                        </label>
                                        <label style={{ ...labelStyle, marginTop: 0 }}>
                                          # Enrolled
                                          <input type="number" min="0" value={bEnr[cat.id] || ""}
                                            onChange={e => setCE("benefitEnrolled", { ...bEnr, [cat.id]: e.target.value })}
                                            style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                                        </label>
                                        <label style={{ ...labelStyle, marginTop: 0 }}>
                                          Commission Type
                                          <select value={bComm[cat.id]?.type || ""}
                                            onChange={e => setCE("benefitCommissions", { ...bComm, [cat.id]: { ...(bComm[cat.id] || {}), type: e.target.value } })}
                                            style={{ ...inputStyle, marginTop: 3, fontSize: 12 }}>
                                            <option value="">— None —</option>
                                            <option value="PEPM">PEPM</option>
                                            <option value="Flat %">Flat %</option>
                                            <option value="Graded">Graded</option>
                                          </select>
                                        </label>
                                        <label style={{ ...labelStyle, marginTop: 0 }}>
                                          Commission Amount
                                          <input type="text" value={bComm[cat.id]?.amount || ""}
                                            onChange={e => setCE("benefitCommissions", { ...bComm, [cat.id]: { ...(bComm[cat.id] || {}), amount: e.target.value } })}
                                            placeholder={bComm[cat.id]?.type === "PEPM" ? "e.g. 4.50" : "e.g. 3.5%"}
                                            style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                                        </label>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Plan year notes */}
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Plan Year Notes
                              <input type="text" value={pyNote}
                                onChange={e => setCE("notes", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                            </label>

                            {/* Mandatory correction reason */}
                            <label style={{ ...labelStyle, marginTop: 8 }}>
                              <span style={{ color: "#dc2626" }}>* </span>Reason for Correction (required)
                              <input type="text" value={correctionNote}
                                onChange={e => setCorrectionNote(e.target.value)}
                                placeholder="Describe what was corrected and why…"
                                style={{ ...inputStyle, marginTop: 3, borderColor: correctionNote.trim() ? "#e2e8f0" : "#fca5a5" }} />
                            </label>

                            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                              <button type="button" onClick={() => saveCorrection(py.id)}
                                disabled={!correctionNote.trim()}
                                style={{ padding: "6px 16px", borderRadius: 7,
                                  fontSize: 12, fontWeight: 700,
                                  cursor: correctionNote.trim() ? "pointer" : "default",
                                  border: "none",
                                  background: correctionNote.trim() ? "#7c3aed" : "#e2e8f0",
                                  color: correctionNote.trim() ? "#fff" : "#94a3b8",
                                  fontFamily: "inherit" }}>Save Correction</button>
                              <button type="button" onClick={() => { setCorrecting(null); setCorrectionNote(""); setCorrectionEdits({}); }}
                                style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                                  border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                                  cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                            </div>

                            {py.correctionNotes && (
                              <div style={{ marginTop: 10, fontSize: 11, color: "#6d28d9",
                                background: "#ede9fe", padding: "6px 10px", borderRadius: 6,
                                whiteSpace: "pre-wrap" }}>
                                <strong>Previous corrections:</strong><br />{py.correctionNotes}
                              </div>
                            )}
                          </div>
                          );
                        })()}

                        {/* Expanded snapshot */}
                        {pyOpen && (
                          <div style={{ padding: "14px 18px", borderTop: "1px solid #e2e8f0" }}>
                            {activeInYear.length === 0 ? (
                              <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No benefits recorded for this plan year.</div>
                            ) : activeInYear.map(cat => {
                              const carrier = (py.benefitCarriers || {})[cat.id] || "";
                              const effDate = (py.benefitEffectiveDates || {})[cat.id] || "";
                              const policy  = (py.benefitPolicyNumbers || {})[cat.id] || "";
                              const comm    = (py.benefitCommissions || {})[cat.id] || {};
                              const plans   = (py.benefitPlans || {})[cat.id] || [];
                              return (
                                <div key={cat.id} style={{ marginBottom: 12, paddingBottom: 12,
                                  borderBottom: "1px solid #f1f5f9" }}>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 4 }}>
                                    {cat.label}
                                  </div>
                                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
                                    {carrier && <span><strong>Carrier:</strong> {carrier}</span>}
                                    {effDate && <span><strong>Effective:</strong> {effDate.slice(5,7)}/{effDate.slice(8,10)}/{effDate.slice(0,4)}</span>}
                                    {policy  && <span><strong>Policy #:</strong> {policy}</span>}
                                    {comm.type && <span><strong>Commission:</strong> {comm.type}{comm.amount ? ` ${comm.amount}` : ""}</span>}
                                  </div>
                                  {plans.length > 0 && (
                                    <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                                      {plans.map((pl, pi) => (
                                        <span key={pi} style={{ fontSize: 11, padding: "1px 8px", borderRadius: 99,
                                          background: "#f1f5f9", color: "#475569" }}>
                                          {pl.name}{pl.type ? ` (${pl.type})` : ""}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Employee classes for this benefit */}
                                  {(py.employeeClasses || []).filter(cls => !!(cls.classBenefits || {})[cat.id]?.included).map((cls, ci) => (
                                    <div key={ci} style={{ fontSize: 11, color: "#3e5878", marginTop: 3 }}>
                                      <strong>{cls.name || `Class ${ci+1}`}:</strong> {(cls.classBenefits || {})[cat.id]?.details || "—"}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
          /* ── Normal client record — Tabbed ── */
          <div>

          {/* ═══════════════ TAB: CLIENT INFORMATION ═══════════════ */}
          {activeTab === "info" && (<div>

          {/* Client Information header with Team Assignment inline */}
          <div onClick={() => toggleSection("clientInfo")} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", userSelect: "none",
            borderBottom: "2px solid #507c9c",
            paddingBottom: 8, marginBottom: collapsed.clientInfo ? 0 : 12, marginTop: 4,
          }}>
            {/* Left: section title */}
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px",
              textTransform: "uppercase", color: "#3e5878" }}>
              Client Information
            </span>
            {/* Right: Team + Lead pickers + chevron */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}
              onClick={e => e.stopPropagation()}>
              {/* Team */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".5px", textTransform: "uppercase" }}>Team</span>
                {Object.entries(TEAMS).map(([key, t]) => (
                  <button key={key} type="button" onClick={() => set("team", key)} style={{
                    padding: "3px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                    fontFamily: "inherit", cursor: "pointer", transition: "all .12s",
                    border: `2px solid ${data.team === key ? t.border : "#e2e8f0"}`,
                    background: data.team === key ? t.color : "#fafafa",
                    color: data.team === key ? t.text : "#94a3b8",
                  }}>{t.label}</button>
                ))}
              </div>
              {/* Lead */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".5px", textTransform: "uppercase" }}>Lead</span>
                {["RG","DS"].map(opt => (
                  <button key={opt} type="button" onClick={() => set("lead", data.lead === opt ? "" : opt)} style={{
                    padding: "3px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                    fontFamily: "inherit", cursor: "pointer", transition: "all .12s",
                    border: `2px solid ${data.lead === opt ? "#6366f1" : "#e2e8f0"}`,
                    background: data.lead === opt ? "#eef2ff" : "#fafafa",
                    color: data.lead === opt ? "#4338ca" : "#94a3b8",
                  }}>{opt}</button>
                ))}
              </div>
              <span style={{ fontSize: 14, color: "#507c9c" }}>{collapsed.clientInfo ? "▼" : "▲"}</span>
            </div>
          </div>
          {!collapsed.clientInfo && (() => {
            const subHdr = (label) => (
              <div style={{ gridColumn: "1 / -1", borderTop: "1.5px solid #e8edf4",
                paddingTop: 10, marginTop: 4,
                fontSize: 10, fontWeight: 800, color: "#94a3b8",
                letterSpacing: "1px", textTransform: "uppercase" }}>{label}</div>
            );
            return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>

              {/* ── ACCOUNT ── */}
              {subHdr("Account")}
              <label style={labelStyle}>
                Client Name
                <input value={data.name} onChange={e => set("name", e.target.value)}
                  placeholder="Enter client name" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Tax ID (EIN)
                <input value={data.taxId || ""} onChange={e => set("taxId", e.target.value)} placeholder="XX-XXXXXXX" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                SIC Code
                <input value={data.sic || ""} onChange={e => set("sic", e.target.value)} placeholder="SIC code" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Nature of Business
                <input value={data.natureOfBusiness || ""} onChange={e => set("natureOfBusiness", e.target.value)} placeholder="e.g. Manufacturing" style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Affiliated Employers
                <input value={data.affiliatedEmployers || ""} onChange={e => set("affiliatedEmployers", e.target.value)} placeholder="Related entities" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                # of Locations
                <input value={data.numLocations || ""} onChange={e => set("numLocations", e.target.value)} placeholder="e.g. 3" style={inputStyle} />
              </label>

              {/* ── ADDRESS ── */}
              {subHdr("Address")}
              <label style={labelStyle}>
                Street Address
                <input value={data.streetAddress || ""} onChange={e => set("streetAddress", e.target.value)} placeholder="123 Main St" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                City
                <input value={data.city || ""} onChange={e => set("city", e.target.value)}
                  onBlur={e => lookupZip(e.target.value, data.state)}
                  placeholder="City" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                State / Zip Code
                <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                  <select value={data.state || ""} onChange={e => { set("state", e.target.value); lookupZip(data.city, e.target.value); }}
                    style={{ ...inputStyle, marginTop: 0, width: 72 }}>
                    <option value="">—</option>
                    {STATE_ABBREVS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={data.zipCode || ""} onChange={e => set("zipCode", e.target.value)}
                    placeholder="60601" style={{ ...inputStyle, marginTop: 0, flex: 1 }} />
                </div>
              </label>
              <label style={labelStyle}>
                Main Phone #
                <input value={data.mainPhone || ""} onChange={e => set("mainPhone", formatPhone(e.target.value))} placeholder="(312) 555-0000" style={inputStyle} />
              </label>

              {/* ── CONTACTS — side by side ── */}
              <div style={{ gridColumn: "1 / -1", borderTop: "1.5px solid #e8edf4",
                paddingTop: 10, marginTop: 4,
                fontSize: 10, fontWeight: 800, color: "#94a3b8",
                letterSpacing: "1px", textTransform: "uppercase" }}>Contacts</div>
              <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Primary */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#3e5878", marginBottom: 10,
                    paddingBottom: 5, borderBottom: "1px solid #e8edf4" }}>Primary Contact</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={labelStyle}>
                      Name
                      <input value={data.contactName || ""} onChange={e => set("contactName", e.target.value)} placeholder="Jane Smith" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Title
                      <input value={data.contactTitle || ""} onChange={e => set("contactTitle", e.target.value)} placeholder="HR Manager" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Email
                      <input value={data.contactEmail || ""} onChange={e => set("contactEmail", e.target.value)} placeholder="jane@company.com" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Phone #
                      <input value={data.contactPhone || ""} onChange={e => set("contactPhone", formatPhone(e.target.value))} placeholder="(312) 555-0100" style={inputStyle} />
                    </label>
                  </div>
                </div>
                {/* Additional */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#3e5878", marginBottom: 10,
                    paddingBottom: 5, borderBottom: "1px solid #e8edf4" }}>Additional Contact</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={labelStyle}>
                      Name
                      <input value={data.addlContactName || ""} onChange={e => set("addlContactName", e.target.value)} placeholder="Additional contact" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Title
                      <input value={data.addlContactTitle || ""} onChange={e => set("addlContactTitle", e.target.value)} placeholder="Benefits Manager" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Email
                      <input value={data.addlContactEmail || ""} onChange={e => set("addlContactEmail", e.target.value)} placeholder="additional@company.com" style={inputStyle} />
                    </label>
                    <label style={labelStyle}>
                      Phone #
                      <input value={data.addlContactPhone || ""} onChange={e => set("addlContactPhone", formatPhone(e.target.value))} placeholder="(312) 555-0101" style={inputStyle} />
                    </label>
                  </div>
                </div>
              </div>

              {/* ── HR & PAYROLL ── */}
              {subHdr("Account Management")}

              {/* Row 1: Renewal Date, Employer Type, Market Size */}
              <label style={labelStyle}>
                Renewal Date
                <input type="date" value={data.renewalDate} onChange={e => {
                  const newDate = e.target.value;
                  setData(p => applyDDR({ ...p, renewalDate: newDate }));
                  if (newDate) {
                    const dt = new Date(newDate);
                    dt.setDate(dt.getDate() - 90);
                    const due = dt.toISOString().split("T")[0];
                    ["renewal_dl", "sbc_dl", "bills_dl", "blue_insights", "census"].forEach(id => {
                      setData(p => {
                        const dbTask = (tasksDb || []).find(t => t.id === "t_" + id) ||
                                       (tasksDb || []).find(t => t.id === id);
                        const dbRole = dbTask?.defaultAssignee || "";
                        const defaultA = dbRole ? resolveAssignee(dbRole, p.team) : getCoordinator(p.team);
                        const existing = p.preRenewal?.[id];
                        const base = (!existing || typeof existing === "string")
                          ? { status: existing || "Not Started", assignee: defaultA, dueDate: due, completedDate: "" }
                          : { ...existing, assignee: existing.assignee || defaultA, dueDate: existing.dueDate || due };
                        return applyDDR({ ...p, preRenewal: { ...p.preRenewal, [id]: { ...base, dueDate: due, assignee: base.assignee || defaultA } } });
                      });
                    });
                  }
                }} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Employer Type
                <select value={data.employerType || ""} onChange={e => set("employerType", e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="Small">Small</option>
                  <option value="Large (ALE)">Large (ALE)</option>
                </select>
              </label>
              <label style={labelStyle}>
                Market Size
                <select value={data.marketSize} onChange={e => {
                  const v = e.target.value;
                  setData(p => applyPreRenewalRules({ ...p, marketSize: v }));
                }} style={inputStyle}>
                  {MARKET_SIZES.map(s => <option key={s}>{s}</option>)}
                </select>
              </label>

              {/* Row 2: Salesperson, Annual Revenue, Benchmarking Type */}
              <label style={labelStyle}>
                Salesperson
                <select value={data.salesPerson || ""} onChange={e => set("salesPerson", e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="SI">SI</option>
                  <option value="Lock">Lock</option>
                  <option value="Amanda">Amanda</option>
                  <option value="Anthony">Anthony</option>
                  <option value="Holly">Holly</option>
                  <option value="Jaclyn">Jaclyn</option>
                  <option value="Jonathon">Jonathon</option>
                  <option value="Rob">Rob</option>
                  <option value="Steve">Steve</option>
                  <option value="BDT">BDT</option>
                </select>
              </label>
              <label style={labelStyle}>
                Annual Revenue
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ padding: "8px 10px", background: "#f1f5f9", border: "1.5px solid #e2e8f0",
                    borderRight: "none", borderRadius: "8px 0 0 8px", fontSize: 13, color: "#475569", fontWeight: 600 }}>$</span>
                  <input type="text"
                    value={data.annualRevenue || ""}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      set("annualRevenue", raw ? Number(raw).toLocaleString() : "");
                    }}
                    onBlur={e => {
                      const raw = e.target.value.replace(/[^0-9]/g, "");
                      set("annualRevenue", raw ? Number(raw).toLocaleString() : "");
                    }}
                    placeholder="0"
                    style={{ ...inputStyle, borderRadius: "0 8px 8px 0", marginTop: 0, flex: 1 }} />
                  <button type="button" title="Auto-calculate from benefit commissions"
                    onClick={() => {
                      const TIERS_CALC = ["ee","es","ec","ff"];
                      let totalAnnual = 0;
                      BENEFITS_SCHEMA.forEach(cat => {
                        if (!(data.benefitActive || {})[cat.id]) return;
                        const comm = (data.benefitCommissions || {})[cat.id] || {};
                        const commType = comm.type || "";
                        const commAmt = parseFloat(comm.amount) || 0;
                        if (!commType || !commAmt) return;
                        const plans = (data.benefitPlans || {})[cat.id] || [];
                        const totalMonthly = plans.reduce((ps, pl) =>
                          ps + TIERS_CALC.reduce((ts, k) =>
                            ts + ((parseFloat((pl.rates||{})[k])||0) * (parseInt((pl.enrolled||{})[k])||0)), 0), 0);
                        const enrolled = plans.reduce((s,pl) =>
                          s + TIERS_CALC.reduce((ts,k) => ts + (parseInt((pl.enrolled||{})[k])||0), 0), 0)
                          || parseInt((data.benefitEnrolled||{})[cat.id]) || 0;
                        const monthly = commType === "PEPM"
                          ? commAmt * enrolled
                          : (commType === "Flat %" || commType === "Graded")
                          ? totalMonthly * (commAmt / 100)
                          : 0;
                        totalAnnual += monthly * 12;
                      });
                      if (totalAnnual > 0) set("annualRevenue", Math.round(totalAnnual).toLocaleString());
                    }}
                    style={{ padding: "7px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, flexShrink: 0,
                      border: "1.5px solid #86efac", background: "#f0fdf4", color: "#166534",
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                    ⚡ Calculate
                  </button>
                </div>
              </label>
              <label style={labelStyle}>
                Benchmarking Type
                <select value={data.benchmarkingType || ""} onChange={e => set("benchmarkingType", e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="Traditional">Traditional</option>
                  <option value="ACA">ACA</option>
                  <option value="n/a">n/a</option>
                </select>
              </label>

              {/* Row 3: Payroll System, Payroll Frequency, Total Eligible */}
              <label style={labelStyle}>
                Payroll System
                <input value={data.payrollSystem || ""} onChange={e => set("payrollSystem", e.target.value)} placeholder="e.g. ADP, Paylocity" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Payroll Frequency
                <select value={data.payrollFrequency || ""} onChange={e => set("payrollFrequency", e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="Weekly (52)">Weekly (52)</option>
                  <option value="Weekly (48)">Weekly (48)</option>
                  <option value="Bi-weekly (26)">Bi-weekly (26)</option>
                  <option value="Bi-weekly (24)">Bi-weekly (24)</option>
                  <option value="Semi-monthly">Semi-monthly</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </label>
              <label style={labelStyle}>
                Total Eligible
                <IntegerInput
                  value={data.totalEligible || ""}
                  onChange={v => set("totalEligible", v)}
                  placeholder="0"
                  style={{ ...inputStyle, marginTop: 3 }} />
              </label>

              {/* Row 4: Benefit Admin System, EDI Feeds Established, Corporate Structure */}
              <label style={labelStyle}>
                Benefit Admin System
                <input value={data.benefitAdminSystem || ""} onChange={e => set("benefitAdminSystem", e.target.value)} placeholder="e.g. Ease, Employee Navigator" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                EDI Feeds Established?
                <select value={data.ediEstablished || ""} onChange={e => set("ediEstablished", e.target.value)} style={inputStyle}>
                  <option value="">— Select —</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="In Progress">In Progress</option>
                  <option value="N/A">N/A</option>
                </select>
              </label>
              <label style={labelStyle}>
                Corporate Structure
                <input value={data.corporateStructure || ""} onChange={e => set("corporateStructure", e.target.value)}
                  placeholder="e.g. S-Corp, LLC, Non-profit" style={inputStyle} />
              </label>

            </div>
          );
          })()}

          {!collapsed.clientInfo && (
          <>
          {/* Group Situs + Client Status + Continuation + Medicare — 4 panels */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 14 }}>

            {/* Group Situs */}
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Group Situs</div>
              <select
                value={data.groupSitus || ""}
                onChange={e => set("groupSitus", e.target.value)}
                style={{ ...inputStyle, marginTop: 0 }}
              >
                <option value="">— Select state —</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {data.marketSize === "ACA" && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px",
                    textTransform: "uppercase", marginTop: 12, marginBottom: 6 }}>Rating Region</div>
                  <select
                    value={data.ratingRegion || ""}
                    onChange={e => set("ratingRegion", e.target.value)}
                    style={{ ...inputStyle, marginTop: 0 }}
                  >
                    <option value="">— Select region —</option>
                    <option value="R1">R1 - Cook</option>
                    <option value="R2">R2 - Lake-McHenry</option>
                    <option value="R3">R3 - Kane-DuPage</option>
                    <option value="R4">R4 - Kendall-Will-Grundy-Kankakee</option>
                    <option value="R5">R5 - DeKalb-Ogle</option>
                    <option value="R6">R6 - Whiteside-Hancock-Rock Island</option>
                    <option value="R7">R7 - Peoria</option>
                    <option value="R10">R10 - Adams-Macon-Shelby</option>
                    <option value="R12">R12 - Madison-Monroe-StClair</option>
                  </select>
                </>
              )}
            </div>

            {/* Client Status */}
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Client Status</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { val: "Active",      color: "#22c55e", bg: "#dcfce7", border: "#86efac" },
                  { val: "Terminated",  color: "#ef4444", bg: "#fee2e2", border: "#fca5a5" },
                  { val: "Transferred", color: "#f59e0b", bg: "#fef3c7", border: "#fcd34d" },
                ].map(opt => (
                  <button key={opt.val} type="button"
                    onClick={() => { set("clientStatus", opt.val); if (opt.val === "Active") set("clientStatusDate", ""); }}
                    style={{
                      padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: "left",
                      border: `2px solid ${data.clientStatus === opt.val ? opt.border : "#e2e8f0"}`,
                      background: data.clientStatus === opt.val ? opt.bg : "#fff",
                      color: data.clientStatus === opt.val ? opt.color : "#64748b",
                      cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
                    }}>{opt.val}</button>
                ))}
                {(data.clientStatus === "Terminated" || data.clientStatus === "Transferred") && (
                  <input type="date" value={data.clientStatusDate || ""}
                    onChange={e => set("clientStatusDate", e.target.value)}
                    style={{ ...inputStyle, marginTop: 4, padding: "4px 8px" }} />
                )}
              </div>
            </div>

            {/* Continuation */}
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Continuation</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { val: "cobra", label: "COBRA" },
                  { val: "state_cont", label: "State Continuation" },
                ].map(opt => {
                  const checked = (data.continuation || []).includes(opt.val);
                  return (
                    <div key={opt.val}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => set("continuation", checked
                            ? (data.continuation || []).filter(v => v !== opt.val)
                            : [...(data.continuation || []), opt.val])}
                          style={{ accentColor: "#507c9c", width: 14, height: 14 }} />
                        <span style={{ fontSize: 13, fontWeight: checked ? 700 : 400,
                          color: checked ? "#0f172a" : "#64748b" }}>{opt.label}</span>
                      </label>
                      {/* COBRA sub-options */}
                      {opt.val === "cobra" && checked && (
                        <div style={{ marginTop: 8, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                            Vendor
                            <input type="text"
                              value={data.cobraVendor || ""}
                              onChange={e => set("cobraVendor", e.target.value)}
                              placeholder="e.g. WEX, Optum"
                              style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", marginTop: 2 }}>
                            <input type="checkbox"
                              checked={!!data.cobraSIPaid}
                              onChange={e => set("cobraSIPaid", e.target.checked)}
                              style={{ accentColor: "#507c9c", width: 14, height: 14 }} />
                            <span style={{ fontSize: 12, fontWeight: data.cobraSIPaid ? 700 : 400,
                              color: data.cobraSIPaid ? "#0f172a" : "#64748b" }}>SI Paid</span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Medicare Eligibility */}
            <div style={{ background: "#f8fafc", borderRadius: 10, border: "1.5px solid #e2e8f0", padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Medicare Eligibility</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { val: "medicare_primary", label: "Medicare Primary" },
                  { val: "plan_primary", label: "Plan Primary" },
                ].map(opt => {
                  const checked = (data.medicareEligibility || []).includes(opt.val);
                  return (
                    <label key={opt.val} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => set("medicareEligibility", checked
                          ? (data.medicareEligibility || []).filter(v => v !== opt.val)
                          : [...(data.medicareEligibility || []), opt.val])}
                        style={{ accentColor: "#507c9c", width: 14, height: 14 }} />
                      <span style={{ fontSize: 13, fontWeight: checked ? 700 : 400,
                        color: checked ? "#0f172a" : "#64748b" }}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

          </div>

          </>
          )}

          </div>)} {/* end Info tab */}

          {/* ═══════════════ TAB: ELIGIBILITY ═══════════════ */}
          {activeTab === "eligibility" && (<div>

          {/* Employee Classes */}
          <CollapseHeader id="employeeClasses" title="Employee Classes" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.employeeClasses && (() => {
            // Only show benefit types that are active on this client
            const activeBenefits = BENEFITS_SCHEMA.filter(cat => !!(data.benefitActive || {})[cat.id]);

            function updateClass(idx, field, val) {
              setData(p => {
                const cl = [...(p.employeeClasses || [])];
                cl[idx] = { ...cl[idx], [field]: val };
                return { ...p, employeeClasses: cl };
              });
            }

            function updateClassBenefit(idx, catId, field, val) {
              setData(p => {
                const cl = [...(p.employeeClasses || [])];
                const existing = cl[idx].classBenefits || {};
                cl[idx] = {
                  ...cl[idx],
                  classBenefits: {
                    ...existing,
                    [catId]: { ...(existing[catId] || {}), [field]: val },
                  },
                };
                return { ...p, employeeClasses: cl };
              });
            }

            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data.employeeClasses || []).length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic", padding: "8px 2px" }}>
                  No classes defined. Click "+ Add Class" to define employee classes, locations, or union groups.
                </div>
              )}
              {(data.employeeClasses || []).map((cls, idx) => (
                <div key={"cls_"+idx} style={{
                  background: "#f8fafc", borderRadius: 10, padding: "12px 14px",
                  border: "1.5px solid #e2e8f0",
                }}>
                  {/* Class name + delete */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <input
                      type="text"
                      value={cls.name || ""}
                      onChange={e => updateClass(idx, "name", e.target.value)}
                      placeholder="Class name (e.g. Full-Time, NA Union, Part-Time 1…)"
                      style={{ ...inputStyle, marginTop: 0, flex: 1, marginRight: 10, fontWeight: 700, fontSize: 13 }}
                    />
                    <button type="button"
                      onClick={() => setData(p => ({ ...p, employeeClasses: (p.employeeClasses||[]).filter((_,i) => i !== idx) }))}
                      style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                        cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>

                  {/* Definition + Eligible */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Definition / Criteria
                      <input type="text" value={cls.definition || ""}
                        onChange={e => updateClass(idx, "definition", e.target.value)}
                        placeholder="e.g. 37.5–40 hrs/wk, North Aurora Union…"
                        style={{ ...inputStyle, marginTop: 3 }} />
                    </label>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      # Eligible in Class
                      <IntegerInput value={cls.eligible || ""}
                        onChange={v => updateClass(idx, "eligible", v)}
                        placeholder="0"
                        style={{ ...inputStyle, marginTop: 3 }} />
                    </label>
                  </div>

                  {/* Per-benefit checkboxes + details */}
                  {activeBenefits.length > 0 && (() => {
                    const benefitsOpen = !cls.benefitsCollapsed;
                    const includedCount = activeBenefits.filter(cat => !!(cls.classBenefits || {})[cat.id]?.included).length;
                    return (
                    <div style={{ marginBottom: 10 }}>
                      <div onClick={() => updateClass(idx, "benefitsCollapsed", benefitsOpen)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          cursor: "pointer", userSelect: "none", marginBottom: benefitsOpen ? 8 : 0,
                          padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "1px",
                            textTransform: "uppercase" }}>Benefits for this Class</span>
                          {includedCount > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                              background: "#dcfce7", color: "#166534" }}>{includedCount} included</span>
                          )}
                          {!benefitsOpen && includedCount === 0 && activeBenefits.length > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                              background: "#fef3c7", color: "#92400e" }}>⚠ None assigned</span>
                          )}
                        </div>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{benefitsOpen ? "▲" : "▼"}</span>
                      </div>
                      {benefitsOpen && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {activeBenefits.map(cat => {
                          const cb = (cls.classBenefits || {})[cat.id] || {};
                          const included = !!cb.included;
                          return (
                            <div key={cat.id} style={{
                              background: included ? "#fff" : "#f8fafc",
                              border: `1.5px solid ${included ? "#bfdbfe" : "#e2e8f0"}`,
                              borderRadius: 8, padding: "8px 10px",
                              transition: "all .12s",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input
                                  type="checkbox"
                                  id={`cb_${idx}_${cat.id}`}
                                  checked={included}
                                  onChange={e => updateClassBenefit(idx, cat.id, "included", e.target.checked)}
                                  style={{ accentColor: "#3b82f6", width: 14, height: 14, flexShrink: 0 }}
                                />
                                <label htmlFor={`cb_${idx}_${cat.id}`} style={{
                                  fontSize: 12, fontWeight: included ? 700 : 500,
                                  color: included ? "#0f172a" : "#64748b",
                                  cursor: "pointer", flex: 1,
                                }}>{cat.label}</label>
                              </div>
                              {included && (
                                <input
                                  type="text"
                                  value={cb.details || ""}
                                  onChange={e => updateClassBenefit(idx, cat.id, "details", e.target.value)}
                                  placeholder={
                                    cat.id === "basic_life" || cat.id === "vol_life"
                                      ? "e.g. 2x salary up to $200,000, GI $132,000 or Flat $25,000"
                                      : cat.id.startsWith("medical")
                                      ? "e.g. Same as standard plan or Class-specific deductible…"
                                      : "Class-specific details, amounts, or exclusions…"
                                  }
                                  style={{ ...inputStyle, marginTop: 6, fontSize: 12, padding: "5px 10px" }}
                                />
                              )}
                            </div>
                          );
                        })}
                        {activeBenefits.length === 0 && (
                          <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                            No active benefits on this client yet — add them in Benefits & Carriers first.
                          </div>
                        )}
                      </div>}
                    </div>
                    );
                  })()}

                  {/* Notes */}
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    Notes
                    <textarea value={cls.notes || ""}
                      onChange={e => updateClass(idx, "notes", e.target.value)}
                      placeholder="Additional details, exclusions, CBA reference, location info…"
                      rows={2}
                      style={{ ...inputStyle, marginTop: 3, resize: "vertical", fontFamily: "inherit", fontSize: 12 }} />
                  </label>

                  {/* Per-class eligibility rules — collapsed by default */}
                  {activeBenefits.length > 0 && (() => {
                    const eligOpen = !!cls.eligibilityOpen;
                    const hasAnyElig = activeBenefits.some(cat => {
                      const ce = (cls.classEligibility || {})[cat.id] || {};
                      return ce.waitingPeriod || ce.effectiveDate || ce.termDate;
                    });
                    return (
                      <div style={{ marginTop: 10 }}>
                        <div onClick={() => updateClass(idx, "eligibilityOpen", !eligOpen)}
                          style={{ display: "flex", alignItems: "center", gap: 8,
                            cursor: "pointer", userSelect: "none", padding: "4px 0" }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b",
                            letterSpacing: "1px", textTransform: "uppercase" }}>
                            Class-Specific Eligibility Rules
                          </span>
                          {hasAnyElig && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px",
                              borderRadius: 99, background: "#f3e8ff", color: "#7c3aed" }}>Customized</span>
                          )}
                          <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{eligOpen ? "▲" : "▼"}</span>
                        </div>
                        {eligOpen && (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ fontSize: 11, color: "#64748b", fontStyle: "italic", marginBottom: 2 }}>
                              Leave blank to inherit from the benefit-level eligibility rules above.
                            </div>
                            {activeBenefits.map(cat => {
                              const ce = (cls.classEligibility || {})[cat.id] || {};
                              const isMedical = cat.id === "medical" || cat.id.startsWith("medical_");
                              const forced90 = isMedical && ce.waitingPeriod === "90 days";

                              function setClassElig(field, val) {
                                setData(p => {
                                  const cl = [...(p.employeeClasses || [])];
                                  const existing = cl[idx].classEligibility || {};
                                  cl[idx] = {
                                    ...cl[idx],
                                    classEligibility: {
                                      ...existing,
                                      [cat.id]: {
                                        ...(existing[cat.id] || {}),
                                        [field]: val,
                                      },
                                    },
                                  };
                                  return { ...p, employeeClasses: cl };
                                });
                              }

                              return (
                                <div key={cat.id} style={{ background: "#fff", border: "1px solid #e2e8f0",
                                  borderRadius: 8, padding: "8px 12px" }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                                    {cat.label}
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                                    <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                      Waiting Period
                                      <select value={ce.waitingPeriod || ""}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setClassElig("waitingPeriod", val);
                                          if (isMedical && val === "90 days") setClassElig("effectiveDate", "Immediate");
                                        }}
                                        style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                        <option value="">— Inherit —</option>
                                        <option value="0 days">0 days</option>
                                        <option value="30 days">30 days</option>
                                        <option value="60 days">60 days</option>
                                        <option value="90 days">90 days</option>
                                        <option value="1 month">1 month</option>
                                        <option value="2 months">2 months</option>
                                        {!isMedical && <option value="6 months">6 months</option>}
                                        {!isMedical && <option value="1 year">1 year</option>}
                                      </select>
                                    </label>
                                    <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                      Effective Date
                                      <select value={forced90 ? "Immediate" : (ce.effectiveDate || "")}
                                        disabled={forced90}
                                        onChange={e => setClassElig("effectiveDate", e.target.value)}
                                        style={{ ...inputStyle, marginTop: 3, fontSize: 11,
                                          opacity: forced90 ? 0.7 : 1,
                                          background: forced90 ? "#f1f5f9" : undefined }}>
                                        <option value="">— Inherit —</option>
                                        <option value="Immediate">Immediate</option>
                                        <option value="FOM">FOM</option>
                                        <option value="FOM (coinciding)">FOM (coinciding)</option>
                                      </select>
                                    </label>
                                    <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                      Termination Date
                                      <select value={ce.termDate || ""}
                                        onChange={e => setClassElig("termDate", e.target.value)}
                                        style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                        <option value="">— Inherit —</option>
                                        <option value="Immediate (DOT)">Immediate (DOT)</option>
                                        <option value="End of Month (EOM)">End of Month (EOM)</option>
                                      </select>
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
              <button type="button" onClick={() => setData(p => ({
                ...p, employeeClasses: [...(p.employeeClasses||[]), { name: "", definition: "", eligible: "", classBenefits: {}, notes: "" }]
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #4a7fa5", background: "#f0f5fa", color: "#2d4a6b",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Class
              </button>
            </div>
            );
          })()}

          </div>)} {/* end Eligibility tab */}

          {/* ═══════════════ TAB: BENEFITS ═══════════════ */}
          {activeTab === "benefits" && (<div>

          {/* Benefits & Carriers */}
          <CollapseHeader id="benefitsSection" title="Benefits &amp; Carriers" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.benefitsSection && (() => {
            const hasClasses = (data.employeeClasses || []).length > 0;
            const [hideNoClass, setHideNoClass] = collapsed._hideNoClass !== undefined
              ? [collapsed._hideNoClass, v => setCollapsed(p => ({ ...p, _hideNoClass: v }))]
              : [false, v => setCollapsed(p => ({ ...p, _hideNoClass: v }))];
            return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Filter bar */}
            {hasClasses && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", marginBottom: 2 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
                  fontSize: 12, fontWeight: 600, color: "#475569" }}>
                  <input type="checkbox" checked={hideNoClass}
                    onChange={e => setHideNoClass(e.target.checked)}
                    style={{ accentColor: "#3b82f6", width: 13, height: 13 }} />
                  Hide benefits with no class assigned
                </label>
              </div>
            )}
            {/* ── Add Coverage button + checklist table ── */}
            {(() => {
              const activeCatIds = Object.keys(data.benefitActive || {}).filter(k => !!(data.benefitActive || {})[k]);
              const showPicker = !!(collapsed._showBenefitPicker);
              const setShowPicker = v => setCollapsed(p => ({ ...p, _showBenefitPicker: v }));

              // Map Benefits DB "benefit" names → BENEFITS_SCHEMA ids
              const BENEFIT_NAME_TO_SCHEMA_ID = {
                "Medical":            "medical",
                "Dental":             "dental",
                "Vision":             "vision",
                "Telehealth":         "telehealth",
                "Base Life/AD&D":     "basic_life",
                "Vol Life":           "vol_life",
                "AD&D":               "vol_life",
                "STD":                "std",
                "LTD":                "ltd",
                "IDI":                "ltd",
                "NYDBL & PFL":        "nydbl_pfl",
                "Accident":           "worksite",
                "Cancer":             "worksite",
                "Critical Illness":   "worksite",
                "Hospital Indemnity": "worksite",
                "EAP":                "eap",
                "Identity Theft":     "identity_theft",
                "Prepaid Legal":      "prepaid_legal",
                "Pet Insurance":      "pet_insurance",
                "FSA":                "fsa",
                "HSA":                "hsa_funding",
                "HRA":                "hra",
                "Commuter":           "fsa",
              };

              // Build catalog from Benefits DB, falling back to BENEFITS_SCHEMA
              // Group by DB category, deduplicate by schema id
              const dbRecords = (benefitsDb && benefitsDb.length > 0)
                ? benefitsDb : BENEFITS_DB_SEED;

              // Build grouped catalog: category → unique schema entries
              const catalogByCategory = {};
              dbRecords.forEach(rec => {
                const schemaId = BENEFIT_NAME_TO_SCHEMA_ID[rec.benefit];
                if (!schemaId) return;
                const schema = BENEFITS_SCHEMA.find(s => s.id === schemaId);
                if (!schema) return;
                if (!catalogByCategory[rec.category]) catalogByCategory[rec.category] = [];
                // Deduplicate by schemaId within category
                const key = schemaId + "__" + rec.benefit;
                if (!catalogByCategory[rec.category].find(e => e.key === key)) {
                  catalogByCategory[rec.category].push({
                    key, schemaId, label: rec.benefit, schema,
                    variant: rec.variant, planDesign: rec.planDesign,
                    fundingMethod: rec.fundingMethod,
                  });
                }
              });

              const categoryOrder = ["Core Health","Life & AD&D","Income Protection",
                "Statutory Income","Worksite","Wellness","Lifestyle","Tax-Advantaged"];

              return (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: showPicker ? 12 : 0 }}>
                    <button type="button" onClick={() => setShowPicker(!showPicker)} style={{
                      padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700,
                      border: `2px solid ${showPicker ? "#507c9c" : "#3e5878"}`,
                      background: showPicker ? "#dce8f0" : "linear-gradient(135deg,#3e5878,#507c9c)",
                      color: showPicker ? "#2d4a6b" : "#fff",
                      cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                    }}>
                      {showPicker ? "✕ Close" : "＋ Add Coverage"}
                    </button>
                    {activeCatIds.length > 0 && !showPicker && (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {activeCatIds.length} line{activeCatIds.length !== 1 ? "s" : ""} of coverage active
                      </span>
                    )}
                  </div>

                  {showPicker && (
                    <div style={{ background: "#f0f5fa", borderRadius: 12, border: "1.5px solid #507c9c", padding: "16px" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#2d4a6b", marginBottom: 12 }}>
                        Select lines of coverage to add — check all that apply:
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {categoryOrder.filter(cat => catalogByCategory[cat]?.length > 0).map(cat => (
                          <div key={cat}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: ".8px",
                              textTransform: "uppercase", marginBottom: 6, paddingBottom: 4,
                              borderBottom: "1px solid #cbd5e1" }}>{cat}</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {catalogByCategory[cat].map(entry => {
                                const isActive = !!(data.benefitActive || {})[entry.schemaId];
                                return (
                                  <label key={entry.key} style={{ display: "flex", alignItems: "flex-start", gap: 9,
                                    cursor: "pointer", padding: "6px 8px", borderRadius: 7,
                                    background: isActive ? "#dce8f0" : "#fff",
                                    border: `1.5px solid ${isActive ? "#507c9c" : "#e2e8f0"}`,
                                    transition: "all .12s" }}>
                                    <input type="checkbox" checked={isActive}
                                      onChange={() => {
                                        setData(p => {
                                          const newActive = { ...(p.benefitActive || {}), [entry.schemaId]: !isActive };
                                          const newDates = { ...(p.benefitEffectiveDates || {}) };
                                          if (!isActive && !newDates[entry.schemaId] && p.renewalDate)
                                            newDates[entry.schemaId] = p.renewalDate;
                                          return { ...p, benefitActive: newActive, benefitEffectiveDates: newDates };
                                        });
                                      }}
                                      style={{ accentColor: "#507c9c", width: 15, height: 15, flexShrink: 0, marginTop: 2 }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500,
                                        color: isActive ? "#2d4a6b" : "#334155" }}>
                                        {entry.label}
                                        {isActive && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700,
                                          color: "#507c9c" }}>✓ Added</span>}
                                      </div>
                                      {entry.planDesign && (
                                        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{entry.planDesign}</div>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                        <button type="button" onClick={() => setShowPicker(false)} style={{
                          padding: "7px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                          border: "none", background: "linear-gradient(135deg,#3e5878,#507c9c)", color: "#fff",
                          cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* ── Active benefits only ── */}
            {(() => {
              return BENEFITS_SCHEMA.filter(cat => !!(data.benefitActive || {})[cat.id]).map(cat => {
              if (hasClasses && collapsed._hideNoClass) {
                const anyAssigned = (data.employeeClasses || []).some(
                  cls => !!(cls.classBenefits || {})[cat.id]?.included
                );
                if (!anyAssigned) return null;
              }
              const leaves = cat.children.length > 0 ? cat.children : [{ id: cat.id, label: cat.label }];
              const isOffered = true;
              const carrierOptions = carriersForBenefit(cat.id);
              const currentCarrier = (data.benefitCarriers || {})[cat.id] || "";
              const effectiveDate = (data.benefitEffectiveDates || {})[cat.id] || "";

              function toggleOffered() {
                if (!confirm(`Remove ${cat.label} from this client's benefits?`)) return;
                setData(p => {
                  const newActive = { ...(p.benefitActive || {}), [cat.id]: false };
                  return { ...p, benefitActive: newActive };
                });
              }

              return (
                <div key={cat.id} style={{
                  borderRadius: 12,
                  border: "1.5px solid #507c9c",
                  background: "#f0f5fa",
                  overflow: "hidden",
                }}>
                  {/* ── Header row ── */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    borderBottom: !((data.benefitCollapsed || {})[cat.id]) ? "1px solid #ccdaeb" : "none",
                  }}>
                    <button type="button" onClick={toggleOffered}
                      title={`Remove ${cat.label}`}
                      style={{ padding: "2px 7px", borderRadius: 5, fontSize: 12, flexShrink: 0,
                        border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                        cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>✕</button>
                    <span
                      onClick={() => isOffered && setData(p => ({
                        ...p,
                        benefitCollapsed: { ...(p.benefitCollapsed || {}), [cat.id]: !((p.benefitCollapsed || {})[cat.id]) },
                      }))}
                      style={{
                        fontWeight: 800, fontSize: 13,
                        color: isOffered ? "#0f172a" : "#94a3b8",
                        letterSpacing: ".3px", flex: 1,
                        cursor: isOffered ? "pointer" : "default",
                      }}>{cat.label}</span>
                    {isOffered && currentCarrier && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: "#3e5878",
                        background: "#dce8f2", padding: "2px 10px", borderRadius: 99,
                      }}>{currentCarrier}</span>
                    )}
                    {isOffered && effectiveDate && (
                      <span style={{ fontSize: 11, color: "#64748b" }}>
                        Eff: {effectiveDate.slice(5,7)}/{effectiveDate.slice(8,10)}/{effectiveDate.slice(0,4)}
                      </span>
                    )}
                    {/* Class assignment badge — only if employee classes exist */}
                    {isOffered && (data.employeeClasses || []).length > 0 && (() => {
                      const assigned = (data.employeeClasses || []).filter(
                        cls => !!(cls.classBenefits || {})[cat.id]?.included
                      );
                      if (assigned.length === 0) return (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px",
                          borderRadius: 99, background: "#fef3c7", color: "#92400e" }}>
                          ⚠ No class
                        </span>
                      );
                      return (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px",
                          borderRadius: 99, background: "#dcfce7", color: "#166534" }}>
                          {assigned.length} class{assigned.length > 1 ? "es" : ""}
                        </span>
                      );
                    })()}
                    {isOffered && (
                      <span
                        onClick={() => setData(p => ({
                          ...p,
                          benefitCollapsed: { ...(p.benefitCollapsed || {}), [cat.id]: !((p.benefitCollapsed || {})[cat.id]) },
                        }))}
                        style={{ fontSize: 12, color: "#cbd5e1", marginLeft: 4, cursor: "pointer" }}>
                        {(data.benefitCollapsed || {})[cat.id] ? "▼" : "▲"}
                      </span>
                    )}
                  </div>

                  {/* ── Expanded body — only when offered and not collapsed ── */}
                  {isOffered && !((data.benefitCollapsed || {})[cat.id]) && (
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

                    {/* Carrier + Effective Date row */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Carrier / Vendor
                          <select
                            value={currentCarrier}
                            onChange={e => setBenefitCarrier(cat.id, e.target.value)}
                            style={{
                              ...inputStyle, marginTop: 3,
                              borderColor: currentCarrier ? "#3b82f6" : undefined,
                              background: currentCarrier ? "#eff6ff" : "#fff",
                              color: currentCarrier ? "#1d4ed8" : "#94a3b8",
                              fontWeight: currentCarrier ? 600 : 400,
                            }}
                          >
                            <option value="">— Select carrier —</option>
                            {carrierOptions.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value="__other__">Other…</option>
                          </select>
                          {currentCarrier === "__other__" && (
                            <input
                              placeholder="Enter carrier name"
                              value={otherCarrierText[cat.id] !== undefined
                                ? otherCarrierText[cat.id]
                                : (data.benefitCarriers || {})[cat.id + "__other_text"] || ""}
                              style={{ ...inputStyle, marginTop: 4 }}
                              onChange={e => {
                                const val = e.target.value;
                                setOtherCarrierText(p => ({ ...p, [cat.id]: val }));
                              }}
                              onBlur={e => {
                                const val = (otherCarrierText[cat.id] !== undefined
                                  ? otherCarrierText[cat.id]
                                  : (data.benefitCarriers || {})[cat.id + "__other_text"] || "").trim();
                                setData(p => ({
                                  ...p,
                                  benefitCarriers: {
                                    ...(p.benefitCarriers || {}),
                                    [cat.id + "__other_text"]: val,
                                    [cat.id]: val || "__other__",
                                  },
                                }));
                              }}
                            />
                          )}
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Effective Date
                          <input
                            type="date"
                            value={effectiveDate}
                            onChange={e => setData(p => ({
                              ...p,
                              benefitEffectiveDates: { ...(p.benefitEffectiveDates || {}), [cat.id]: e.target.value },
                            }))}
                            style={{ ...inputStyle, marginTop: 3 }}
                          />
                        </label>
                      </div>

                      {/* Policy Number + Funding Method (medical) + Commissions + # Enrolled row */}
                      <div style={{ display: "grid", gridTemplateColumns: cat.id === "medical" ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Policy Number
                          <input
                            type="text"
                            value={(data.benefitPolicyNumbers || {})[cat.id] || ""}
                            onChange={e => setData(p => ({
                              ...p,
                              benefitPolicyNumbers: { ...(p.benefitPolicyNumbers || {}), [cat.id]: e.target.value },
                            }))}
                            placeholder="e.g. 123456"
                            style={{ ...inputStyle, marginTop: 3 }}
                          />
                        </label>
                        {cat.id === "medical" && (
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Funding Method
                            <select value={data.fundingMethod} onChange={e => set("fundingMethod", e.target.value)} style={{ ...inputStyle, marginTop: 3 }}>
                              {FUNDING_METHODS.map(f => <option key={f}>{f}</option>)}
                            </select>
                          </label>
                        )}
                        <div style={{ ...labelStyle, marginTop: 0 }}>
                          Commissions
                          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                            <select
                              value={(data.benefitCommissions || {})[cat.id]?.type || ""}
                              onChange={e => setData(p => ({
                                ...p,
                                benefitCommissions: {
                                  ...(p.benefitCommissions || {}),
                                  [cat.id]: { ...(p.benefitCommissions?.[cat.id] || {}), type: e.target.value, amount: "" },
                                },
                              }))}
                              style={{ ...inputStyle, marginTop: 0, flex: "0 0 90px" }}
                            >
                              <option value="">— Type —</option>
                              <option value="PEPM">PEPM</option>
                              <option value="Flat %">Flat %</option>
                              <option value="Graded">Graded</option>
                            </select>
                            {(() => {
                              const commType = (data.benefitCommissions || {})[cat.id]?.type || "";
                              const isPEPM = commType === "PEPM";
                              const isPct  = commType === "Flat %" || commType === "Graded";
                              const amount = (data.benefitCommissions || {})[cat.id]?.amount || "";
                              const setAmount = val => setData(p => ({
                                ...p,
                                benefitCommissions: {
                                  ...(p.benefitCommissions || {}),
                                  [cat.id]: { ...(p.benefitCommissions?.[cat.id] || {}), amount: val },
                                },
                              }));
                              if (!commType) return null;
                              if (isPEPM) return (
                                <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                                  <span style={{ padding: "8px 8px", background: "#f1f5f9",
                                    border: "1.5px solid #e2e8f0", borderRight: "none",
                                    borderRadius: "8px 0 0 8px", fontSize: 13, color: "#475569", fontWeight: 600, flexShrink: 0 }}>$</span>
                                  <input type="text" inputMode="decimal"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                    onBlur={e => {
                                      const n = parseFloat(e.target.value.replace(/[^0-9.]/g,""));
                                      if (!isNaN(n)) setAmount(String(Math.round(n)));
                                    }}
                                    placeholder="0.00"
                                    style={{ ...inputStyle, marginTop: 0, flex: 1,
                                      borderRadius: "0 8px 8px 0", borderLeft: "none", textAlign: "right" }} />
                                </div>
                              );
                              // Flat % or Graded
                              return (
                                <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                                  <input type="text" inputMode="decimal"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                                    onBlur={e => {
                                      const n = parseFloat(e.target.value.replace(/[^0-9.]/g,""));
                                      if (!isNaN(n)) setAmount(String(Math.round(n)));
                                    }}
                                    placeholder="0.00"
                                    style={{ ...inputStyle, marginTop: 0, flex: 1,
                                      borderRadius: "8px 0 0 8px", borderRight: "none", textAlign: "right" }} />
                                  <span style={{ padding: "8px 8px", background: "#f1f5f9",
                                    border: "1.5px solid #e2e8f0", borderLeft: "none",
                                    borderRadius: "0 8px 8px 0", fontSize: 13, color: "#475569", fontWeight: 600, flexShrink: 0 }}>%</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          # Enrolled
                          <IntegerInput
                            value={(data.benefitEnrolled || {})[cat.id] || ""}
                            onChange={v => {
                              setData(p => {
                                const updated = {
                                  ...p,
                                  benefitEnrolled: { ...(p.benefitEnrolled || {}), [cat.id]: v },
                                  ...(cat.id === "medical" ? { medicalEnrolled: v } : {}),
                                };
                                return cat.id === "medical" ? applyPreRenewalRules(updated) : updated;
                              });
                            }}
                            placeholder="# enrolled"
                            style={{ ...inputStyle, marginTop: 3 }}
                          />
                        </label>
                      </div>

                      {/* Plans — with per-plan rates and enrollment tiers */}
                      {(() => {
                        const plans = (data.benefitPlans || {})[cat.id] || [];
                        const isBCBSIL = currentCarrier === "BCBSIL" || currentCarrier === "BCBS ?";
                        // Benefits that get rate/PEPM + enrollment tier rows
                        const needsRates = ["medical","dental","vision","worksite"].includes(cat.id)
                          || cat.id.startsWith("medical_");
                        const TIERS = [
                          { key: "ee", label: "EE" },
                          { key: "es", label: "EE + Spouse" },
                          { key: "ec", label: "EE + Child(ren)" },
                          { key: "ff", label: "Family" },
                        ];
                        const setPlans = (newPlans) => setData(p => ({
                          ...p,
                          benefitPlans: { ...(p.benefitPlans || {}), [cat.id]: newPlans },
                        }));
                        const updatePlan = (idx, field, val) => {
                          setPlans(plans.map((pl, i) => i === idx ? { ...pl, [field]: val } : pl));
                        };
                        const updatePlanRate = (idx, tier, val) => {
                          setPlans(plans.map((pl, i) => i === idx
                            ? { ...pl, rates: { ...(pl.rates || {}), [tier]: val } } : pl));
                        };
                        const updatePlanEnrolled = (idx, tier, val) => {
                          setPlans(plans.map((pl, i) => i === idx
                            ? { ...pl, enrolled: { ...(pl.enrolled || {}), [tier]: val } } : pl));
                        };
                        return (
                          <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                            {/* Plan limit warning from carrier DB */}
                            {(() => {
                              const carrierObj = (carriersData || []).find(c => c.name === currentCarrier);
                              const limit = (carrierObj?.planLimits || []).find(pl =>
                                pl.benefit && cat.label && pl.benefit.toLowerCase() === cat.label.toLowerCase()
                              );
                              if (!limit || !limit.maxPlans) return null;
                              const max = parseInt(limit.maxPlans);
                              const over = plans.length > max;
                              return (
                                <div style={{ marginBottom: 8, padding: "5px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                                  background: over ? "#fee2e2" : "#f0fdf4",
                                  border: `1px solid ${over ? "#fca5a5" : "#86efac"}`,
                                  color: over ? "#991b1b" : "#166534" }}>
                                  {over ? "⚠️" : "ℹ️"} {currentCarrier} allows max {max} plan{max!==1?"s":""} for {cat.label}
                                  {limit.condition ? ` (${limit.condition})` : ""}
                                  {over ? ` — currently ${plans.length} configured` : ""}
                                </div>
                              );
                            })()}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: plans.length > 0 ? 10 : 4 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".8px", textTransform: "uppercase", flexShrink: 0 }}>
                                # of Plans Offered
                              </div>
                              <input
                                type="text" inputMode="numeric"
                                value={plans.length || ""}
                                placeholder="0"
                                onChange={e => {
                                  const n = parseInt(e.target.value.replace(/\D/g,"")) || 0;
                                  const blank = () => ({ name: "", type: "", groupNumber: "", carrierPlanNumber: "",
                                    rates: { ee: "", es: "", ec: "", ff: "" },
                                    enrolled: { ee: "", es: "", ec: "", ff: "" } });
                                  if (n > plans.length) {
                                    setPlans([...plans, ...Array(n - plans.length).fill(null).map(blank)]);
                                  } else if (n < plans.length) {
                                    if (n === 0 || confirm(`Reduce to ${n} plan${n!==1?"s":""}? Extra plans will be removed.`))
                                      setPlans(plans.slice(0, n));
                                  }
                                }}
                                style={{ width: 56, padding: "5px 10px", border: "1.5px solid #e2e8f0",
                                  borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#2d4a6b",
                                  fontFamily: "inherit", textAlign: "center", background: "#fff" }}
                              />
                              {plans.length > 0 && (
                                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                                  {plans.length} plan{plans.length !== 1 ? "s" : ""} configured
                                </span>
                              )}
                            </div>

                            {plans.map((pl, idx) => (
                              <div key={idx} style={{ background: "#fff", borderRadius: 8,
                                border: "1.5px solid #e2e8f0", padding: "10px 12px", marginBottom: 10 }}>

                                {/* Unified grid: Coverage Tier=140px, #Enrolled=1fr, Rate/PEPM=1fr, Monthly Total=1fr, ✕=auto */}
                                {/* Plan header labels */}
                                <div style={{ display: "grid",
                                  gridTemplateColumns: isBCBSIL ? "140px 1fr 1fr 1fr 1fr auto" : "140px 1fr 1fr 1fr auto",
                                  gap: 8, marginBottom: 4, alignItems: "end" }}>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Plan Name
                                    <input type="text" value={pl.name || ""}
                                      onChange={e => updatePlan(idx, "name", e.target.value)}
                                      placeholder="e.g. Blue Choice PPO"
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Carrier Plan #
                                    <input type="text" value={pl.carrierPlanNumber || ""}
                                      onChange={e => updatePlan(idx, "carrierPlanNumber", e.target.value)}
                                      placeholder="e.g. 12345"
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Plan Type
                                    <select value={pl.type || ""}
                                      onChange={e => updatePlan(idx, "type", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      {(["dental"].includes(cat.id)
                                        ? ["PPO","DHMO","Voluntary PPO","Voluntary DHMO"]
                                        : ["vision","basic_life","vol_life"].includes(cat.id)
                                        ? ["Non-contributory","Contributory","Voluntary","Buy-Up"]
                                        : ["std","ltd","worksite","identity_theft","prepaid_legal","pet_insurance","telehealth"].includes(cat.id)
                                        ? ["Non-contributory","Contributory","Voluntary","Buy-Up"]
                                        : ["nydbl_pfl"].includes(cat.id) ? ["ER-Paid","Voluntary"]
                                        : ["fsa"].includes(cat.id) ? ["Health FSA","LP FSA","DC FSA"]
                                        : currentCarrier === "UHC" || currentCarrier === "UMR"
                                        ? ["PPO","HMO","HSA","HRA","Surest","Nexus"]
                                        : currentCarrier === "BCBSIL" || currentCarrier === "BCBS ?"
                                        ? ["PPO","HMO","HSA","HRA","Options"]
                                        : ["PPO","HMO","HSA","HRA"]
                                      ).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                  </label>
                                  {isBCBSIL && (
                                    <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                      Group #
                                      <input type="text" value={pl.groupNumber || ""}
                                        onChange={e => updatePlan(idx, "groupNumber", e.target.value)}
                                        placeholder="Group number"
                                        style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                                    </label>
                                  )}
                                  {/* Empty spacer for Monthly Total column */}
                                  <div />
                                  <button type="button"
                                    onClick={() => setPlans(plans.filter((_, i) => i !== idx))}
                                    style={{ padding: "6px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                      border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                                      cursor: "pointer", fontFamily: "inherit", alignSelf: "end" }}>✕</button>
                                </div>

                                {/* Per-plan rate + enrollment tiers */}
                                {needsRates && (
                                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 8, marginTop: 4 }}>
                                    {/* Column headers — same grid as plan header above */}
                                    <div style={{ display: "grid",
                                      gridTemplateColumns: isBCBSIL ? "140px 1fr 1fr 1fr 1fr auto" : "140px 1fr 1fr 1fr auto",
                                      gap: 8, marginBottom: 6 }}>
                                      {["Coverage Tier", "# Enrolled", "Rate / PEPM", "Monthly Total",
                                        ...(isBCBSIL ? [""] : []), ""].map((h, i) => (
                                        <div key={i} style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                                          letterSpacing: ".6px", textTransform: "uppercase",
                                          textAlign: i <= 1 ? "left" : "center",
                                          visibility: i === (isBCBSIL ? 5 : 4) ? "hidden" : "visible" }}>{h}</div>
                                      ))}
                                    </div>
                                    {/* One row per tier — same grid */}
                                    {TIERS.map(({ key, label }) => {
                                      const rate = Number((pl.rates || {})[key]) || 0;
                                      const enrolled = Number((pl.enrolled || {})[key]) || 0;
                                      const monthlyTotal = rate * enrolled;
                                      return (
                                        <div key={key} style={{ display: "grid",
                                          gridTemplateColumns: isBCBSIL ? "140px 1fr 1fr 1fr 1fr auto" : "140px 1fr 1fr 1fr auto",
                                          gap: 8, marginBottom: 5, alignItems: "center" }}>
                                          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</div>
                                          {/* # Enrolled */}
                                          <IntegerInput
                                            value={(pl.enrolled || {})[key] || ""}
                                            onChange={v => updatePlanEnrolled(idx, key, v)}
                                            placeholder="0"
                                            style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 8px", textAlign: "center", width: "100%" }} />
                                          {/* Rate / PEPM */}
                                          <CurrencyInput
                                            value={(pl.rates || {})[key] || ""}
                                            onChange={v => updatePlanRate(idx, key, v)}
                                            placeholder="0.00"
                                            style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 8px", flex: 1, textAlign: "right" }} />
                                          {/* Monthly Total */}
                                          <div style={{ fontSize: 12, fontWeight: 700,
                                            color: monthlyTotal > 0 ? "#166534" : "#94a3b8",
                                            textAlign: "center",
                                            background: monthlyTotal > 0 ? "#f0fdf4" : "#f8fafc",
                                            border: `1.5px solid ${monthlyTotal > 0 ? "#86efac" : "#e2e8f0"}`,
                                            borderRadius: 7, padding: "5px 8px",
                                            gridColumn: isBCBSIL ? "4 / span 2" : "4" }}>
                                            {monthlyTotal > 0
                                              ? "$" + monthlyTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                              : "—"}
                                          </div>
                                          {/* Spacer for ✕ column */}
                                          {!isBCBSIL && <div />}
                                        </div>
                                      );
                                    })}
                                    {/* Totals row */}
                                    {(() => {
                                      const totalEnrolled = TIERS.reduce((sum, { key }) =>
                                        sum + (Number((pl.enrolled || {})[key]) || 0), 0);
                                      const totalPremium = TIERS.reduce((sum, { key }) =>
                                        sum + ((Number((pl.rates || {})[key]) || 0) * (Number((pl.enrolled || {})[key]) || 0)), 0);
                                      if (totalEnrolled === 0) return null;
                                      return (
                                        <div style={{ display: "grid",
                                          gridTemplateColumns: isBCBSIL ? "140px 1fr 1fr 1fr 1fr auto" : "140px 1fr 1fr 1fr auto",
                                          gap: 8, paddingTop: 6, borderTop: "1.5px solid #e2e8f0", marginTop: 3 }}>
                                          <div style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>Total</div>
                                          <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af" }}>
                                            {totalEnrolled} enrolled
                                          </div>
                                          <div />
                                          <div style={{ fontSize: 12, fontWeight: 800, color: "#166534", textAlign: "center",
                                            background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 7, padding: "5px 8px",
                                            gridColumn: isBCBSIL ? "4 / span 2" : "4" }}>
                                            ${totalPremium.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* ── Revenue Estimate ── */}
                      {(() => {
                        const comm = (data.benefitCommissions || {})[cat.id] || {};
                        const plans = (data.benefitPlans || {})[cat.id] || [];
                        const commType = comm.type || "";
                        const commAmt = parseFloat(comm.amount) || 0;
                        if (!commType || !commAmt) return null;

                        const TIERS_REV = ["ee","es","ec","ff"];

                        // Calculate total monthly premium across all plans
                        const totalMonthlyPremium = plans.reduce((planSum, pl) => {
                          return planSum + TIERS_REV.reduce((tierSum, key) => {
                            const rate = parseFloat((pl.rates || {})[key]) || 0;
                            const enrolled = parseInt((pl.enrolled || {})[key]) || 0;
                            return tierSum + (rate * enrolled);
                          }, 0);
                        }, 0);

                        // Total enrolled across all plans and tiers
                        const totalEnrolled = plans.reduce((sum, pl) =>
                          sum + TIERS_REV.reduce((s, k) => s + (parseInt((pl.enrolled || {})[k]) || 0), 0), 0);

                        // Fall back to legacy benefitEnrolled if no per-plan data
                        const legacyEnrolled = parseInt((data.benefitEnrolled || {})[cat.id]) || 0;
                        const effectiveEnrolled = totalEnrolled || legacyEnrolled;

                        let monthlyRevenue = 0;
                        if (commType === "PEPM") {
                          monthlyRevenue = commAmt * effectiveEnrolled;
                        } else if (commType === "Flat %" || commType === "Graded") {
                          monthlyRevenue = totalMonthlyPremium * (commAmt / 100);
                        }

                        if (monthlyRevenue <= 0) return null;
                        const annualRevenue = monthlyRevenue * 12;

                        return (
                          <div style={{ background: "#f0fdf4", borderRadius: 8, border: "1.5px solid #86efac",
                            padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 800, color: "#166534", letterSpacing: ".7px", textTransform: "uppercase", marginBottom: 2 }}>
                                Estimated Revenue — {cat.label}
                              </div>
                              <div style={{ fontSize: 11, color: "#166534" }}>
                                {commType === "PEPM"
                                  ? `$${commAmt.toFixed(2)} PEPM × ${effectiveEnrolled} enrolled`
                                  : `${commAmt}% of $${totalMonthlyPremium.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}/mo premium`}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#166534", opacity: .7 }}>Monthly</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#166534" }}>
                                  ${monthlyRevenue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#166534", opacity: .7 }}>Annual</div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: "#166534" }}>
                                  ${annualRevenue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Eligibility Rules */}
                      <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8",
                            letterSpacing: ".8px", textTransform: "uppercase" }}>
                            Eligibility Rules
                          </div>

                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                          <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                            New Hire Waiting Period
                            {(() => {
                              const isMedical = cat.id === "medical" || cat.id.startsWith("medical_");
                              const currentWait = ((data.benefitEligibility || {})[cat.id] || {}).newHireWaitingPeriod || "";
                              return (
                                <select
                                  value={currentWait}
                                  onChange={e => {
                                    const val = e.target.value;
                                    // If medical + 90 days, force effective date to Immediate
                                    const forceImmediate = isMedical && val === "90 days";
                                    setData(p => ({
                                      ...p,
                                      benefitEligibility: {
                                        ...(p.benefitEligibility || {}),
                                        [cat.id]: {
                                          ...((p.benefitEligibility || {})[cat.id] || {}),
                                          newHireWaitingPeriod: val,
                                          ...(forceImmediate ? { newHireEffDate: "Immediate" } : {}),
                                        },
                                      },
                                    }));
                                  }}
                                  style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                  <option value="">— Select —</option>
                                  <option value="0 days">0 days</option>
                                  <option value="30 days">30 days</option>
                                  <option value="60 days">60 days</option>
                                  <option value="90 days">90 days</option>
                                  <option value="1 month">1 month</option>
                                  <option value="2 months">2 months</option>
                                  {!isMedical && <option value="6 months">6 months</option>}
                                  {!isMedical && <option value="1 year">1 year</option>}
                                </select>
                              );
                            })()}
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                            New Hire Effective Date
                            {(() => {
                              const isMedical = cat.id === "medical" || cat.id.startsWith("medical_");
                              const currentWait = ((data.benefitEligibility || {})[cat.id] || {}).newHireWaitingPeriod || "";
                              const forced = isMedical && currentWait === "90 days";
                              const currentEff = ((data.benefitEligibility || {})[cat.id] || {}).newHireEffDate || "";
                              return (
                                <select
                                  value={forced ? "Immediate" : currentEff}
                                  disabled={forced}
                                  onChange={e => setData(p => ({
                                    ...p,
                                    benefitEligibility: {
                                      ...(p.benefitEligibility || {}),
                                      [cat.id]: { ...((p.benefitEligibility || {})[cat.id] || {}), newHireEffDate: e.target.value },
                                    },
                                  }))}
                                  style={{ ...inputStyle, marginTop: 3, fontSize: 11,
                                    opacity: forced ? 0.7 : 1, background: forced ? "#f1f5f9" : undefined }}>
                                  <option value="">— Select —</option>
                                  <option value="Immediate">Immediate</option>
                                  <option value="FOM">FOM</option>
                                  <option value="FOM (coinciding)">FOM (coinciding)</option>
                                </select>
                              );
                            })()}
                            {((data.benefitEligibility || {})[cat.id] || {}).newHireWaitingPeriod === "90 days" &&
                             (cat.id === "medical" || cat.id.startsWith("medical_")) && (
                              <div style={{ fontSize: 10, color: "#92400e", marginTop: 3, fontStyle: "italic" }}>
                                Required: Immediate for 90-day wait
                              </div>
                            )}
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                            Termination Date
                            <select
                              value={((data.benefitEligibility || {})[cat.id] || {}).termDate || ""}
                              onChange={e => setData(p => ({
                                ...p,
                                benefitEligibility: {
                                  ...(p.benefitEligibility || {}),
                                  [cat.id]: { ...((p.benefitEligibility || {})[cat.id] || {}), termDate: e.target.value },
                                },
                              }))}
                              style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                              <option value="">— Select —</option>
                              <option value="Immediate (DOT)">Immediate (DOT)</option>
                              <option value="End of Month (EOM)">End of Month (EOM)</option>
                            </select>
                          </label>
                        </div>

                        {/* ── Additional carrier & eligibility fields from spreadsheet ── */}
                        {(() => {
                          const elig = (data.benefitEligibility || {})[cat.id] || {};
                          function setElig(field, val) {
                            setData(p => ({
                              ...p,
                              benefitEligibility: {
                                ...(p.benefitEligibility || {}),
                                [cat.id]: { ...((p.benefitEligibility || {})[cat.id] || {}), [field]: val },
                              },
                            }));
                          }
                          const isLifeLike = ["basic_life","vol_life"].includes(cat.id);
                          const isDisability = ["std","ltd"].includes(cat.id);
                          const isLifeOrDisab = isLifeLike || isDisability;
                          const isWorksite = cat.id.startsWith("worksite");
                          const isFSA = cat.id === "fsa" || cat.id.startsWith("fsa_");
                          const isCommuter = cat.id === "commuter";
                          const isHSA = cat.id === "hsa_funding";
                          const isEAP = cat.id === "eap";
                          return (
                            <>
                              {/* Row: carrier contact + hours/week + dependent age-off + domestic partner */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                                <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                  Carrier Contact
                                  <input type="text" value={elig.carrierContact || ""}
                                    onChange={e => setElig("carrierContact", e.target.value)}
                                    placeholder="Name / phone / email"
                                    style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                                </label>
                                <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                  Hours/Week for Eligibility
                                  <input type="text" value={elig.hoursWeek || ""}
                                    onChange={e => setElig("hoursWeek", e.target.value)}
                                    placeholder="e.g. 30 hrs/week"
                                    style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                                </label>
                                {!isFSA && !isCommuter && !isHSA && !isEAP && (
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Dependent Age-Off Rule
                                    <select value={elig.dependentAgeOff || ""}
                                      onChange={e => setElig("dependentAgeOff", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Birthday">Birthday</option>
                                      <option value="End of Month">End of Month</option>
                                      <option value="End of Year">End of Year</option>
                                    </select>
                                  </label>
                                )}
                                {!isFSA && !isCommuter && !isHSA && (
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Domestic Partner Coverage
                                    <select value={elig.domesticPartner || ""}
                                      onChange={e => setElig("domesticPartner", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                )}
                              </div>

                              {/* Row: retiree coverage + carrier EDI + portability + conversion */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                                {!isFSA && !isCommuter && !isHSA && !isEAP && (
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Retiree Coverage
                                    <select value={elig.retireeCoverage || ""}
                                      onChange={e => setElig("retireeCoverage", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                )}
                                <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                  Carrier EDI Connection
                                  <select value={elig.carrierEdi || ""}
                                    onChange={e => setElig("carrierEdi", e.target.value)}
                                    style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                    <option value="">— Select —</option>
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                    <option value="In Progress">In Progress</option>
                                  </select>
                                </label>
                                {(isLifeLike || isDisability || isWorksite) && (
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Portability Included
                                    <select value={elig.portability || ""}
                                      onChange={e => setElig("portability", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                )}
                                {(isLifeLike || isDisability || isWorksite) && (
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Conversion Included
                                    <select value={elig.conversion || ""}
                                      onChange={e => setElig("conversion", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                )}
                              </div>

                              {/* Life-specific fields */}
                              {isLifeLike && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    AD&D Included
                                    <select value={elig.adAndD || ""}
                                      onChange={e => setElig("adAndD", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Rate Based On
                                    <select value={elig.rateBased || ""}
                                      onChange={e => setElig("rateBased", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Employee age">Employee age</option>
                                      <option value="Spouse age">Spouse age</option>
                                      <option value="Flat rate">Flat rate</option>
                                    </select>
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Age Band Changes On
                                    <input type="text" value={elig.ageBandChanges || ""}
                                      onChange={e => setElig("ageBandChanges", e.target.value)}
                                      placeholder="e.g. Jan 1 or birthday"
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                                  </label>
                                </div>
                              )}

                              {/* STD/LTD-specific fields */}
                              {isDisability && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Voluntary or Employer Paid
                                    <select value={elig.voluntaryOrEmployer || ""}
                                      onChange={e => setElig("voluntaryOrEmployer", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Voluntary">Voluntary</option>
                                      <option value="Employer Paid">Employer Paid</option>
                                      <option value="Contributory">Contributory</option>
                                    </select>
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Deductions
                                    <select value={elig.deductionType || ""}
                                      onChange={e => setElig("deductionType", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Pre-tax">Pre-tax</option>
                                      <option value="Post-tax">Post-tax</option>
                                    </select>
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Gross Up In Place
                                    <select value={elig.grossUp || ""}
                                      onChange={e => setElig("grossUp", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                </div>
                              )}

                              {/* FSA-specific fields */}
                              {isFSA && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                                  {[["Medical FSA","medFSA"],["Limited Purpose FSA","lpFSA"],["Dependent Care FSA","dcFSA"]].map(([lbl,key]) => (
                                    <label key={key} style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                      {lbl}
                                      <select value={elig[key] || ""}
                                        onChange={e => setElig(key, e.target.value)}
                                        style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                        <option value="">— Select —</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                      </select>
                                    </label>
                                  ))}
                                </div>
                              )}

                              {/* Commuter-specific fields */}
                              {isCommuter && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Transit Available
                                    <select value={elig.transitAvailable || ""}
                                      onChange={e => setElig("transitAvailable", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Parking Available
                                    <select value={elig.parkingAvailable || ""}
                                      onChange={e => setElig("parkingAvailable", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                </div>
                              )}

                              {/* HSA-specific fields */}
                              {isHSA && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 8 }}>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Employer Withdraws Contributions Pre-Tax
                                    <select value={elig.employerPreTax || ""}
                                      onChange={e => setElig("employerPreTax", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Yes">Yes</option>
                                      <option value="No">No</option>
                                    </select>
                                  </label>
                                </div>
                              )}

                              {/* EAP-specific fields */}
                              {isEAP && (
                                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 8 }}>
                                  <label style={{ ...labelStyle, marginTop: 0, fontSize: 11 }}>
                                    Stand Alone or Tied to Coverage
                                    <select value={elig.standAlone || ""}
                                      onChange={e => setElig("standAlone", e.target.value)}
                                      style={{ ...inputStyle, marginTop: 3, fontSize: 11 }}>
                                      <option value="">— Select —</option>
                                      <option value="Stand Alone">Stand Alone</option>
                                      <option value="Tied to Medical">Tied to Medical</option>
                                      <option value="Tied to Coverage">Tied to Coverage</option>
                                    </select>
                                  </label>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Bundled Discount — Medical only, hidden for ACA + Fully Insured */}
                      {cat.id === "medical" && !(data.marketSize === "ACA" && data.fundingMethod === "Fully Insured") && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                          background: "#f2f4e8", borderRadius: 8, border: "1px solid #7a8a3d", padding: "8px 12px" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                            <input type="checkbox"
                              checked={!!data.bundledDiscount}
                              onChange={e => set("bundledDiscount", e.target.checked)}
                              style={{ accentColor: "#7a8a3d", width: 14, height: 14 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#54652d" }}>Bundled Discount</span>
                          </label>
                          {data.bundledDiscount && (
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#54652d", fontWeight: 600 }}>
                              Discount %:
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <input type="number" min="0" max="100"
                                  value={data.bundledDiscountPct || ""}
                                  onChange={e => set("bundledDiscountPct", e.target.value)}
                                  placeholder="0"
                                  style={{ ...inputStyle, marginTop: 0, width: 64, textAlign: "right", padding: "4px 6px" }} />
                                <span style={{ marginLeft: 3, fontWeight: 700, color: "#15803d" }}>%</span>
                              </div>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Renewal Decision */}
                      <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8",
                          letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 8 }}>
                          Renewal Decision
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
                          {[
                            { val: "renew_as_is", label: "Renew As Is" },
                            { val: "change_plans", label: "Change Plans" },
                            { val: "change_carrier", label: "Change Carrier" },
                          ].map(opt => {
                            const checked = (data.benefitDecision || {})[cat.id] === opt.val;
                            return (
                              <label key={opt.val} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                <input type="checkbox"
                                  checked={checked}
                                  onChange={() => setData(p => ({
                                    ...p,
                                    benefitDecision: {
                                      ...(p.benefitDecision || {}),
                                      [cat.id]: checked ? "" : opt.val,
                                    },
                                  }))}
                                  style={{ accentColor: "#507c9c", width: 14, height: 14 }} />
                                <span style={{ fontSize: 12, fontWeight: checked ? 700 : 400,
                                  color: checked ? "#3e5878" : "#64748b" }}>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {(data.benefitDecision || {})[cat.id] === "change_carrier" && (
                          <label style={{ ...labelStyle, marginTop: 0, fontSize: 12 }}>
                            New Carrier
                            <input type="text"
                              value={(data.benefitNewCarrier || {})[cat.id] || ""}
                              onChange={e => setData(p => ({
                                ...p,
                                benefitNewCarrier: { ...(p.benefitNewCarrier || {}), [cat.id]: e.target.value },
                              }))}
                              placeholder="Enter new carrier name"
                              style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                          </label>
                        )}
                      </div>

                      {/* Notes / Comments */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8",
                          letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 4 }}>
                          Notes / Comments
                        </div>
                        <textarea
                          value={(data.benefitNotes && typeof data.benefitNotes === "object" && data.benefitNotes[cat.id]) || ""}
                          onChange={e => setData(p => ({
                            ...p,
                            benefitNotes: {
                              ...(typeof p.benefitNotes === "object" && p.benefitNotes !== null ? p.benefitNotes : {}),
                              [cat.id]: e.target.value,
                            },
                          }))}
                          rows={2}
                          placeholder={`Notes about ${cat.label}...`}
                          style={{
                            width: "100%", padding: "6px 10px", borderRadius: 7,
                            border: "1.5px solid #e2e8f0", fontSize: 12,
                            fontFamily: "inherit", resize: "vertical",
                            background: "#fff", color: "#334155",
                          }}
                        />
                      </div>

                      {/* Employee Class — interactive two-way editing */}
                      {(data.employeeClasses || []).length > 0 && (() => {
                        const noneAssigned = (data.employeeClasses || []).every(
                          cls => !(cls.classBenefits || {})[cat.id]?.included
                        );
                        function toggleClassBenefit(clsIdx, checked) {
                          setData(p => {
                            const cl = [...(p.employeeClasses || [])];
                            cl[clsIdx] = {
                              ...cl[clsIdx],
                              classBenefits: {
                                ...(cl[clsIdx].classBenefits || {}),
                                [cat.id]: {
                                  ...(cl[clsIdx].classBenefits?.[cat.id] || {}),
                                  included: checked,
                                },
                              },
                            };
                            return { ...p, employeeClasses: cl };
                          });
                        }
                        function setClassDetail(clsIdx, val) {
                          setData(p => {
                            const cl = [...(p.employeeClasses || [])];
                            cl[clsIdx] = {
                              ...cl[clsIdx],
                              classBenefits: {
                                ...(cl[clsIdx].classBenefits || {}),
                                [cat.id]: {
                                  ...(cl[clsIdx].classBenefits?.[cat.id] || {}),
                                  details: val,
                                },
                              },
                            };
                            return { ...p, employeeClasses: cl };
                          });
                        }
                        const bcClassOpen = !!collapsed["bcc_" + cat.id];
                        return (
                          <div style={{ marginTop: 10 }}>
                            <div onClick={() => setCollapsed(p => ({ ...p, ["bcc_" + cat.id]: !p["bcc_" + cat.id] }))}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                cursor: "pointer", userSelect: "none",
                                marginBottom: bcClassOpen ? 6 : 0, padding: "4px 0",
                                borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b",
                                  letterSpacing: ".8px", textTransform: "uppercase" }}>
                                  Employee Classes
                                </div>
                                {noneAssigned && (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px",
                                    borderRadius: 99, background: "#fef3c7", color: "#92400e" }}>
                                    ⚠ No class assigned
                                  </span>
                                )}
                                {!noneAssigned && (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px",
                                    borderRadius: 99, background: "#dcfce7", color: "#166534" }}>
                                    {(data.employeeClasses || []).filter(cls => !!(cls.classBenefits || {})[cat.id]?.included).length} assigned
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: 12, color: "#94a3b8" }}>{bcClassOpen ? "▲" : "▼"}</span>
                            </div>
                            {bcClassOpen && <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {(data.employeeClasses || []).map((cls, ci) => {
                                const cb = (cls.classBenefits || {})[cat.id] || {};
                                const included = !!cb.included;
                                return (
                                  <div key={ci} style={{
                                    borderRadius: 8, padding: "7px 10px",
                                    background: included ? "#f0f5fa" : "#f8fafc",
                                    border: `1px solid ${included ? "#bfdbfe" : "#e2e8f0"}`,
                                    transition: "all .12s",
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                      <input
                                        type="checkbox"
                                        id={`bc_${cat.id}_${ci}`}
                                        checked={included}
                                        onChange={e => toggleClassBenefit(ci, e.target.checked)}
                                        style={{ accentColor: "#3b82f6", width: 13, height: 13, flexShrink: 0 }}
                                      />
                                      <label htmlFor={`bc_${cat.id}_${ci}`} style={{
                                        fontSize: 12, fontWeight: included ? 700 : 500,
                                        color: included ? "#2d4a6b" : "#64748b",
                                        cursor: "pointer", flex: 1,
                                      }}>
                                        {cls.name || `Class ${ci + 1}`}
                                      </label>
                                    </div>
                                    {included && (
                                      <input
                                        type="text"
                                        value={cb.details || ""}
                                        onChange={e => setClassDetail(ci, e.target.value)}
                                        placeholder={
                                          cat.id === "basic_life" || cat.id === "vol_life"
                                            ? "e.g. 2x salary up to $200,000, GI $132,000 or Flat $25,000"
                                            : "Class-specific details, amounts, or exclusions…"
                                        }
                                        style={{ ...inputStyle, marginTop: 6, fontSize: 11,
                                          padding: "4px 8px" }}
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>}
                          </div>
                        );
                      })()}

                    </div>
                  )}
                </div>
              );
            });})()}
          </div>
          );
          })()}

          </div>)} {/* end Benefits tab */}

          {/* ═══════════════ TAB: TASKS ═══════════════ */}
          {activeTab === "tasks" && (<div>

          {/* Pre-Renewal */}
          {taskTab === "preRenewal" && (<div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>

              {/* Medical Renewal Status — all groups */}
              {(() => {
                const showRateRelief = !(data.marketSize === "ACA" && data.fundingMethod === "Fully Insured");
                const rr = data.rateRelief || {};
                const rv = data.renewalReceived || {};
                return (
                <div style={{ background: "#fffbeb", borderRadius: 10, border: "1.5px solid #fde68a", padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>
                    Medical Renewal Status
                  </div>

                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: `1.4fr 80px 120px 80px${showRateRelief ? " 120px 120px 90px" : ""}`, gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #fde68a" }}>
                    {["Carrier", "Received", "Date Received", "Renewal %", ...(showRateRelief ? ["Rate Relief Req.", "Rate Relief Rec.", "Negotiated %"] : [])].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 800, color: "#92400e", letterSpacing: ".5px", textTransform: "uppercase" }}>{h}</div>
                    ))}
                  </div>

                  {/* Single data row */}
                  <div style={{ display: "grid", gridTemplateColumns: `1.4fr 80px 120px 80px${showRateRelief ? " 120px 120px 90px" : ""}`, gap: 6, alignItems: "center", background: rv.received ? "#fffde7" : "#fff", borderRadius: 6, padding: "4px 0" }}>
                    {/* Carrier */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#78350f", paddingLeft: 4 }}>
                      {(data.benefitCarriers || {}).medical || <span style={{ opacity: 0.4, fontStyle: "italic", fontWeight: 400 }}>Medical carrier</span>}
                    </div>
                    {/* Renewal Received checkbox */}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                      <input type="checkbox" checked={!!rv.received}
                        onChange={e => set("renewalReceived", { ...rv, received: e.target.checked })}
                        style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                    </label>
                    {/* Date Received */}
                    <input type="date" value={rv.date || ""}
                      onChange={e => {
                        const newRec = { ...rv, date: e.target.value };
                        setData(p => applyDDR({ ...p, renewalReceived: newRec }));
                      }}
                      disabled={!rv.received}
                      style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11,
                        opacity: rv.received ? 1 : 0.35, background: rv.received ? "#fff" : "#f8fafc" }} />
                    {/* Renewal % */}
                    <PercentInput value={rv.pct || ""} onChange={v => set("renewalReceived", { ...rv, pct: v })}
                      placeholder="0.00" disabled={!rv.received}
                      style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11,
                        opacity: rv.received ? 1 : 0.35, background: rv.received ? "#fff" : "#f8fafc", width: "100%" }} />
                    {/* Rate Relief Requested */}
                    {showRateRelief && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                        <input type="checkbox" checked={!!rr.requested}
                          onChange={e => set("rateRelief", { ...rr, requested: e.target.checked })}
                          style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                        <span style={{ fontSize: 11, color: rr.requested ? "#92400e" : "#94a3b8", fontWeight: rr.requested ? 700 : 400 }}>
                          {rr.requested ? "Requested" : "No"}
                        </span>
                      </label>
                    )}
                    {/* Rate Relief Received */}
                    {showRateRelief && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                        <input type="checkbox" checked={!!rr.received}
                          onChange={e => set("rateRelief", { ...rr, received: e.target.checked })}
                          style={{ accentColor: "#22c55e", width: 15, height: 15 }} />
                        <span style={{ fontSize: 11, color: rr.received ? "#166534" : "#94a3b8", fontWeight: rr.received ? 700 : 400 }}>
                          {rr.received ? "Received" : "No"}
                        </span>
                      </label>
                    )}
                    {/* Negotiated Renewal % */}
                    {showRateRelief && (
                      <PercentInput value={data.negotiatedRenewalPct || ""}
                        onChange={v => set("negotiatedRenewalPct", v)}
                        placeholder="0.00"
                        style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, width: "100%",
                          background: data.negotiatedRenewalPct ? "#f0fdf4" : "#fff",
                          borderColor: data.negotiatedRenewalPct ? "#86efac" : undefined }} />
                    )}
                  </div>

                  {/* Decisions Received + tracker rows below */}
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 12px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", flex: 1 }}>📋 Decisions Received</span>
                      <input type="date" value={data.decisionsReceivedDate || ""}
                        onChange={e => setData(p => applyDDR({ ...p, decisionsReceivedDate: e.target.value }))}
                        style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "3px 8px", width: 150 }} />
                    </div>
                    {["Mid-Market", "Large"].includes(data.marketSize) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10,
                        padding: "7px 12px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", flex: 1 }}>
                          <input type="checkbox" checked={!!data.renewalTrackerUpdated}
                            onChange={e => set("renewalTrackerUpdated", e.target.checked)}
                            style={{ accentColor: "#f59e0b", width: 14, height: 14 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Renewal Tracker Updated</span>
                        </label>
                        {data.renewalTrackerUpdated && (
                          <input type="date" value={data.renewalTrackerUpdatedDate || ""}
                            onChange={e => set("renewalTrackerUpdatedDate", e.target.value)}
                            style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "3px 8px", width: 150 }} />
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 12px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", flex: 1 }}>
                        <input type="checkbox" checked={!!data.carrierChangeTrackerUpdated}
                          onChange={e => set("carrierChangeTrackerUpdated", e.target.checked)}
                          style={{ accentColor: "#f59e0b", width: 14, height: 14 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Carrier Change Tracker Updated</span>
                      </label>
                      {data.carrierChangeTrackerUpdated && (
                        <input type="date" value={data.carrierChangeTrackerUpdatedDate || ""}
                          onChange={e => set("carrierChangeTrackerUpdatedDate", e.target.value)}
                          style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "3px 8px", width: 150 }} />
                      )}
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* Ancillary Renewal Status — per line */}
              {(() => {
                const ANCILLARY_BENEFIT_IDS = [
                  "dental", "vision", "std", "ltd", "basic_life", "vol_life",
                  "worksite", "nydbl_pfl", "eap", "telehealth", "identity_theft",
                  "prepaid_legal", "pet_insurance",
                ];
                const ancCarriers = data.benefitCarriers || {};
                const ancActive = data.benefitActive || {};
                const activeBenefits = ANCILLARY_BENEFIT_IDS
                  .filter(id => ancActive[id])
                  .map(id => {
                    const cat = BENEFITS_SCHEMA.find(c => c.id === id);
                    const carrier = ancCarriers[id] || "";
                    return { id, label: cat ? cat.label : id, carrier };
                  });
                if (activeBenefits.length === 0) return null;

                return (
                  <div style={{ background: "#fffbeb", borderRadius: 10, border: "1.5px solid #fde68a", padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>
                      Ancillary Renewal Status
                    </div>
                    {/* Column headers */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 80px 120px 80px 120px 120px 90px", gap: 6, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #fde68a" }}>
                      {["Line of Coverage", "Carrier", "Received", "Date Received", "Renewal %", "Rate Relief Req.", "Rate Relief Rec.", "Negotiated %"].map(h => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 800, color: "#92400e", letterSpacing: ".5px", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>
                    {activeBenefits.map(b => {
                      const key = "anc_line_" + b.id;
                      const stored = (data.ancillaryRenewalReceived || {})[key] || {};
                      const setAnc = (field, val) => setData(p => ({
                        ...p,
                        ancillaryRenewalReceived: {
                          ...(p.ancillaryRenewalReceived || {}),
                          [key]: { ...((p.ancillaryRenewalReceived || {})[key] || {}), [field]: val },
                        },
                      }));
                      const rowBg = stored.received ? "#fffde7" : "#fff";
                      return (
                        <div key={key} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 80px 120px 80px 120px 120px 90px", gap: 6, marginBottom: 5, alignItems: "center", background: rowBg, borderRadius: 6, padding: "4px 0" }}>
                          {/* Line name */}
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#78350f", paddingLeft: 4 }}>{b.label}</div>
                          {/* Carrier */}
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {b.carrier && b.carrier !== "__other__" ? b.carrier : <span style={{ opacity: 0.4, fontStyle: "italic" }}>No carrier</span>}
                          </div>
                          {/* Received checkbox */}
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                            <input type="checkbox" checked={!!stored.received}
                              onChange={e => setAnc("received", e.target.checked)}
                              style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                          </label>
                          {/* Date received */}
                          <input type="date" value={stored.date || ""}
                            onChange={e => setAnc("date", e.target.value)}
                            disabled={!stored.received}
                            style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11,
                              opacity: stored.received ? 1 : 0.35, background: stored.received ? "#fff" : "#f8fafc" }} />
                          {/* Renewal % */}
                          <PercentInput value={stored.pct || ""} onChange={v => setAnc("pct", v)}
                            placeholder="0.00" disabled={!stored.received}
                            style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, width: "100%",
                              opacity: stored.received ? 1 : 0.35, background: stored.received ? "#fff" : "#f8fafc" }} />
                          {/* Rate Relief Requested */}
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                            <input type="checkbox" checked={!!stored.rrRequested}
                              onChange={e => setAnc("rrRequested", e.target.checked)}
                              style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                            <span style={{ fontSize: 11, color: stored.rrRequested ? "#92400e" : "#94a3b8", fontWeight: stored.rrRequested ? 700 : 400 }}>
                              {stored.rrRequested ? "Requested" : "No"}
                            </span>
                          </label>
                          {/* Rate Relief Received */}
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", justifyContent: "center" }}>
                            <input type="checkbox" checked={!!stored.rrReceived}
                              onChange={e => setAnc("rrReceived", e.target.checked)}
                              style={{ accentColor: "#22c55e", width: 15, height: 15 }} />
                            <span style={{ fontSize: 11, color: stored.rrReceived ? "#166534" : "#94a3b8", fontWeight: stored.rrReceived ? 700 : 400 }}>
                              {stored.rrReceived ? "Received" : "No"}
                            </span>
                          </label>
                          {/* Negotiated Renewal % */}
                          <PercentInput value={stored.negotiatedPct || ""} onChange={v => setAnc("negotiatedPct", v)}
                            placeholder="0.00"
                            style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, width: "100%",
                              background: stored.negotiatedPct ? "#f0fdf4" : "#fff",
                              borderColor: stored.negotiatedPct ? "#86efac" : undefined }} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {PRERENEWAL_TASKS.filter(t => !t.acaOnly || data.marketSize === "ACA").map(t => {
                const task = getTask("preRenewal", t.id, tasksDb);
                const isNA = task.status === "N/A";
                const isDone = task.status === "Complete";
                return (
                  <div key={t.id} style={{
                    background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                    borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                    border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : task.status === "In Progress" ? "#fde68a" : "#e2e8f0"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700,
                        textDecoration: isNA ? "line-through" : "none",
                        color: isNA ? "#94a3b8" : "#0f172a" }}>{getLabelForTask(t.id, tasksDb, t.label)}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button type="button"
                          onClick={() => setTask("preRenewal", t.id, "status", isNA ? "Not Started" : "N/A")}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                            background: isNA ? "#f1f5f9" : "#fff",
                            color: isNA ? "#64748b" : "#94a3b8",
                            cursor: "pointer", fontFamily: "inherit" }}>N/A</button>
                        <StatusSelect value={task.status} onChange={v => setTask("preRenewal", t.id, "status", v)} />
                      </div>
                    </div>
                    {!isNA && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Assignee
                            <select value={task.assignee} onChange={e => setTask("preRenewal", t.id, "assignee", e.target.value)}
                              style={{ ...inputStyle, marginTop: 3 }}>
                              <option value="">— Unassigned —</option>
                              {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Due Date
                            <input type="date" value={task.dueDate}
                              onChange={e => setTask("preRenewal", t.id, "dueDate", e.target.value)}
                              style={{ ...inputStyle, marginTop: 3 }} />
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Date Completed
                            <input type="date" value={task.completedDate || ""}
                              onChange={e => {
                                setTask("preRenewal", t.id, "completedDate", e.target.value);
                                if (e.target.value) setTask("preRenewal", t.id, "status", "Complete");
                              }}
                              style={{ ...inputStyle, marginTop: 3,
                                background: task.completedDate ? "#f0fdf4" : "#fff",
                                borderColor: task.completedDate ? "#86efac" : undefined }} />
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Notes
                            <input type="text" value={task.notes || ""}
                              onChange={e => setTask("preRenewal", t.id, "notes", e.target.value)}
                              placeholder="Notes..."
                              style={{ ...inputStyle, marginTop: 3 }} />
                          </label>
                        </div>
                        {/* Follow-ups */}
                        <FollowUpBlock
                          followUps={(task.followUps||[])}
                          onAdd={() => setTask("preRenewal", t.id, "followUps", [...(task.followUps||[]), {id:Date.now(), date:new Date().toISOString().split("T")[0], note:""}])}
                          onChangeDate={(fi, v) => { const fus=[...(task.followUps||[])]; fus[fi]={...fus[fi],date:v}; setTask("preRenewal", t.id, "followUps", fus); }}
                          onChangeNote={(fi, v) => { const fus=[...(task.followUps||[])]; fus[fi]={...fus[fi],note:v}; setTask("preRenewal", t.id, "followUps", fus); }}
                          onRemove={(fi) => setTask("preRenewal", t.id, "followUps", (task.followUps||[]).filter((_,i)=>i!==fi))}
                        />
                        {/* Exhibit type selector — only for the exhibits task */}
                        {t.hasExhibitType && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Exhibit Type:</span>
                              {["Regular", "BlueView"].map(opt => (
                                <button key={opt} type="button"
                                  onClick={() => setTask("preRenewal", t.id, "exhibitType",
                                    task.exhibitType === opt ? "" : opt)}
                                  style={{
                                    padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                                    border: `1.5px solid ${task.exhibitType === opt ? "#3b82f6" : "#e2e8f0"}`,
                                    background: task.exhibitType === opt ? "#dce8f2" : "#fff",
                                    color: task.exhibitType === opt ? "#1d4ed8" : "#64748b",
                                    cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
                                  }}>{opt}</button>
                              ))}
                            </div>
                            {task.exhibitType && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingLeft: 4,
                                background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px" }}>
                                {[
                                  { key: "tabBenchmarking",    label: "Benchmarking Tab Included?" },
                                  { key: "tabABCD",            label: "ABCD Tab Included?" },
                                  { key: "tabDependentParent", label: "Dependent Parent Tab Included?" },
                                  { key: "tabBenefitHub",      label: "BenefitHub Tab Included?" },
                                ].map(tab => {
                                  const checked = !!(task[tab.key]);
                                  return (
                                    <label key={tab.key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                      <input type="checkbox" checked={checked}
                                        onChange={() => setTask("preRenewal", t.id, tab.key, !checked)}
                                        style={{ accentColor: "#507c9c", width: 13, height: 13 }} />
                                      <span style={{ fontSize: 12, fontWeight: checked ? 700 : 400,
                                        color: checked ? "#3e5878" : "#64748b" }}>{tab.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* RFP carriers — only for the Medical RFP task */}
                        {t.hasRfpCarriers && (
                          <div style={{
                            background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0",
                            padding: "10px 12px", marginTop: 4,
                          }}>
                            <div
                              onClick={() => setTask("preRenewal", t.id, "rfpCollapsed", !task.rfpCollapsed)}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                cursor: "pointer", userSelect: "none",
                                fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px",
                                textTransform: "uppercase", marginBottom: task.rfpCollapsed ? 0 : 8 }}>
                              <span>RFP Carriers</span>
                              <span style={{ fontSize: 13, fontWeight: 400, letterSpacing: 0 }}>
                                {task.rfpCollapsed ? "▼" : "▲"}
                              </span>
                            </div>
                            {!task.rfpCollapsed && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {[...["Aetna", "BCBS", "Cigna", "UHC"],
                                ...((task.rfpExtraCarriers || []).filter(c => c.trim())),
                              ].map(carrier => {
                                const rfp = (task.rfpCarriers || {})[carrier] || {};
                                const isChecked = !!rfp.sent;
                                return (
                                  <div key={carrier} style={{
                                    display: "flex", flexDirection: "column", gap: 6,
                                    padding: "8px 10px", borderRadius: 7,
                                    background: isChecked ? "#f0f5fa" : "#fff",
                                    border: `1px solid ${isChecked ? "#4a7fa5" : "#e2e8f0"}`,
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                      <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 80 }}>
                                        <input type="checkbox" checked={isChecked}
                                          onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                            ...(task.rfpCarriers || {}),
                                            [carrier]: { ...rfp, sent: e.target.checked },
                                          })}
                                          style={{ accentColor: "#4a7fa5", width: 13, height: 13 }} />
                                        <span style={{ fontSize: 12, fontWeight: isChecked ? 700 : 400,
                                          color: isChecked ? "#2d4a6b" : "#64748b" }}>{carrier}</span>
                                      </label>
                                      {isChecked && (
                                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                                          Due:
                                          <input type="date" value={rfp.dueDate || ""}
                                            onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                              ...(task.rfpCarriers || {}),
                                              [carrier]: { ...rfp, dueDate: e.target.value },
                                            })}
                                            style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, width: "auto" }} />
                                        </label>
                                      )}
                                    </div>
                                    {isChecked && [
                                      { key: "fi", label: "Fully Insured Quote" },
                                      { key: "lf", label: "Level-Funded Quote" },
                                    ].map(qt => {
                                      // Compute auto-N/A reason
                                      let autoNAReason = null;
                                      if (qt.key === "fi" && data.marketSize === "ACA" && ["Aetna", "Cigna"].includes(carrier)) {
                                        autoNAReason = "N/A — ACA group";
                                      }
                                      if (carrier === "Cigna") {
                                        const eligible = Number(data.totalEligible) || 0;
                                        const enrolled = Number((data.benefitEnrolled || {}).medical) || 0;
                                        if (qt.key === "lf") {
                                          if (eligible < 25 || enrolled < 20) {
                                            const reasons = [];
                                            if (eligible < 25) reasons.push(`${eligible}/25 eligible`);
                                            if (enrolled < 20) reasons.push(`${enrolled}/20 enrolled`);
                                            autoNAReason = `N/A — Cigna LF min not met (${reasons.join(", ")})`;
                                          }
                                        }
                                        if (qt.key === "fi" && !autoNAReason) {
                                          const participation = eligible > 0 ? (enrolled / eligible) * 100 : 0;
                                          if (participation < 50) {
                                            autoNAReason = `N/A — Cigna FI requires 50% participation (${eligible > 0 ? Math.round(participation) : 0}% current)`;
                                          }
                                        }
                                      }
                                      const autoNA = !!autoNAReason;
                                      const isNA = autoNA || !!rfp[qt.key + "_na"];
                                      return (
                                      <div key={qt.key} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingLeft: 20,
                                        opacity: autoNA ? 0.5 : 1 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: "#475569", minWidth: 120 }}>{qt.label}</span>
                                        {autoNA ? (
                                          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", background: "#f1f5f9",
                                            padding: "1px 8px", borderRadius: 99 }}>{autoNAReason}</span>
                                        ) : (
                                          <>
                                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                          <input type="checkbox" checked={!!rfp[qt.key + "_received"]}
                                            onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                              ...(task.rfpCarriers || {}),
                                              [carrier]: { ...rfp, [qt.key + "_received"]: e.target.checked },
                                            })}
                                            style={{ accentColor: "#22c55e", width: 12, height: 12 }} />
                                          <span style={{ color: rfp[qt.key + "_received"] ? "#166534" : "#64748b", fontWeight: rfp[qt.key + "_received"] ? 700 : 400 }}>Received</span>
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                          <input type="checkbox" checked={!!rfp[qt.key + "_dtq"]}
                                            onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                              ...(task.rfpCarriers || {}),
                                              [carrier]: { ...rfp, [qt.key + "_dtq"]: e.target.checked },
                                            })}
                                            style={{ accentColor: "#f59e0b", width: 12, height: 12 }} />
                                          <span style={{ color: rfp[qt.key + "_dtq"] ? "#92400e" : "#64748b", fontWeight: rfp[qt.key + "_dtq"] ? 700 : 400 }}>DTQ</span>
                                        </label>
                                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                          <input type="checkbox" checked={!!rfp[qt.key + "_na"]}
                                            onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                              ...(task.rfpCarriers || {}),
                                              [carrier]: { ...rfp, [qt.key + "_na"]: e.target.checked },
                                            })}
                                            style={{ accentColor: "#94a3b8", width: 12, height: 12 }} />
                                          <span style={{ color: rfp[qt.key + "_na"] ? "#475569" : "#94a3b8", fontWeight: rfp[qt.key + "_na"] ? 700 : 400 }}>N/A</span>
                                        </label>
                                          </>
                                        )}
                                      </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              {/* Pending name inputs for new custom carriers */}
                              {(task.rfpExtraCarriers || []).map((c, ci) => c === "" ? (
                                <div key={"med_pending_"+ci} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input type="text"
                                    value={pendingCarrier["med_"+ci] !== undefined ? pendingCarrier["med_"+ci] : ""}
                                    autoFocus
                                    onChange={e => setPendingCarrier(p => ({ ...p, ["med_"+ci]: e.target.value }))}
                                    onBlur={() => {
                                      const name = (pendingCarrier["med_"+ci] || "").trim();
                                      if (name) {
                                        const updated = [...(task.rfpExtraCarriers || [])];
                                        updated[ci] = name;
                                        setTask("preRenewal", t.id, "rfpExtraCarriers", updated);
                                      }
                                      setPendingCarrier(p => { const n = { ...p }; delete n["med_"+ci]; return n; });
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") e.target.blur();
                                    }}
                                    placeholder="Type carrier name, press Enter…"
                                    style={{ ...inputStyle, marginTop: 0, flex: 1, fontSize: 12 }} />
                                  <button type="button"
                                    onClick={() => {
                                      setTask("preRenewal", t.id, "rfpExtraCarriers",
                                        (task.rfpExtraCarriers || []).filter((_, i) => i !== ci));
                                      setPendingCarrier(p => { const n = { ...p }; delete n["med_"+ci]; return n; });
                                    }}
                                    style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                      border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                                      cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                                </div>
                              ) : null)}
                              <button type="button"
                                onClick={() => setTask("preRenewal", t.id, "rfpExtraCarriers",
                                  [...(task.rfpExtraCarriers || []), ""])}
                                style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  border: "1.5px dashed #4a7fa5", background: "#f0f5fa", color: "#2d4a6b",
                                  cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start", marginTop: 2 }}>
                                + Add Carrier
                              </button>
                            </div>
                            )}
                          </div>
                        )}

                        {/* Ancillary RFP carriers */}
                        {t.hasAncRfpCarriers && (
                          <div style={{
                            background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0",
                            padding: "10px 12px", marginTop: 4,
                          }}>
                            <div
                              onClick={() => setTask("preRenewal", t.id, "rfpCollapsed", !task.rfpCollapsed)}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                                cursor: "pointer", userSelect: "none",
                                fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px",
                                textTransform: "uppercase", marginBottom: task.rfpCollapsed ? 0 : 8 }}>
                              <span>RFP Carriers</span>
                              <span style={{ fontSize: 13, fontWeight: 400, letterSpacing: 0 }}>
                                {task.rfpCollapsed ? "▼" : "▲"}
                              </span>
                            </div>
                            {!task.rfpCollapsed && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {[...["Dearborn/Symetra", "Guardian", "MetLife (EM)", "Mutual of Omaha", "Principal", "Sun Life", "UNUM"],
                                ...((task.ancRfpExtraCarriers || []).filter(c => c.trim())),
                              ].map(carrier => {
                                const rfp = (task.rfpCarriers || {})[carrier] || {};
                                const isChecked = !!rfp.sent;
                                return (
                                  <div key={carrier} style={{
                                    padding: "8px 10px", borderRadius: 7,
                                    background: isChecked ? "#f0f5fa" : "#fff",
                                    border: `1px solid ${isChecked ? "#4a7fa5" : "#e2e8f0"}`,
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                      <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 130 }}>
                                        <input type="checkbox" checked={isChecked}
                                          onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                            ...(task.rfpCarriers || {}),
                                            [carrier]: { ...rfp, sent: e.target.checked },
                                          })}
                                          style={{ accentColor: "#4a7fa5", width: 13, height: 13 }} />
                                        <span style={{ fontSize: 12, fontWeight: isChecked ? 700 : 400,
                                          color: isChecked ? "#2d4a6b" : "#64748b" }}>{carrier}</span>
                                      </label>
                                      {isChecked && (
                                        <>
                                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                                            Due:
                                            <input type="date" value={rfp.dueDate || ""}
                                              onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                                ...(task.rfpCarriers || {}),
                                                [carrier]: { ...rfp, dueDate: e.target.value },
                                              })}
                                              style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, width: "auto" }} />
                                          </label>
                                          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                            <input type="checkbox" checked={!!rfp.received}
                                              onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                                ...(task.rfpCarriers || {}),
                                                [carrier]: { ...rfp, received: e.target.checked },
                                              })}
                                              style={{ accentColor: "#22c55e", width: 12, height: 12 }} />
                                            <span style={{ color: rfp.received ? "#166534" : "#64748b", fontWeight: rfp.received ? 700 : 400 }}>Received</span>
                                          </label>
                                          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                                            <input type="checkbox" checked={!!rfp.dtq}
                                              onChange={e => setTask("preRenewal", t.id, "rfpCarriers", {
                                                ...(task.rfpCarriers || {}),
                                                [carrier]: { ...rfp, dtq: e.target.checked },
                                              })}
                                              style={{ accentColor: "#f59e0b", width: 12, height: 12 }} />
                                            <span style={{ color: rfp.dtq ? "#92400e" : "#64748b", fontWeight: rfp.dtq ? 700 : 400 }}>DTQ</span>
                                          </label>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              {/* Pending name inputs for new custom carriers */}
                              {(task.ancRfpExtraCarriers || []).map((c, ci) => c === "" ? (
                                <div key={"anc_pending_"+ci} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input type="text"
                                    value={pendingCarrier["anc_"+ci] !== undefined ? pendingCarrier["anc_"+ci] : ""}
                                    autoFocus
                                    onChange={e => setPendingCarrier(p => ({ ...p, ["anc_"+ci]: e.target.value }))}
                                    onBlur={() => {
                                      const name = (pendingCarrier["anc_"+ci] || "").trim();
                                      if (name) {
                                        const updated = [...(task.ancRfpExtraCarriers || [])];
                                        updated[ci] = name;
                                        setTask("preRenewal", t.id, "ancRfpExtraCarriers", updated);
                                      }
                                      setPendingCarrier(p => { const n = { ...p }; delete n["anc_"+ci]; return n; });
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === "Enter") e.target.blur();
                                    }}
                                    placeholder="Type carrier name, press Enter…"
                                    style={{ ...inputStyle, marginTop: 0, flex: 1, fontSize: 12 }} />
                                  <button type="button"
                                    onClick={() => {
                                      setTask("preRenewal", t.id, "ancRfpExtraCarriers",
                                        (task.ancRfpExtraCarriers || []).filter((_, i) => i !== ci));
                                      setPendingCarrier(p => { const n = { ...p }; delete n["anc_"+ci]; return n; });
                                    }}
                                    style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                      border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                                      cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                                </div>
                              ) : null)}
                              {/* Add custom carrier */}
                              <button type="button"
                                onClick={() => setTask("preRenewal", t.id, "ancRfpExtraCarriers",
                                  [...(task.ancRfpExtraCarriers || []), ""])}
                                style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  border: "1.5px dashed #4a7fa5", background: "#f0f5fa", color: "#2d4a6b",
                                  cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start", marginTop: 2 }}>
                                + Add Carrier
                              </button>
                            </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Manual pre-renewal tasks */}
              {(data.preRenewal?.__extra || []).map((t, idx) => {
                const isNA = t.status === "N/A";
                const isDone = t.status === "Complete";
                return (
                  <div key={"pr_extra_"+idx} style={{
                    background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                    borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                    border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : "#e2e8f0"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isNA ? 0 : 8 }}>
                      <input value={t.title||""} onChange={e => setData(p => {
                        const ex = [...(p.preRenewal?.__extra||[])];
                        ex[idx] = { ...ex[idx], title: e.target.value };
                        return { ...p, preRenewal: { ...p.preRenewal, __extra: ex } };
                      })} placeholder="Task name..." style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 600 }} />
                      <StatusSelect value={t.status||"Not Started"} onChange={v => setData(p => {
                        const ex = [...(p.preRenewal?.__extra||[])];
                        ex[idx] = { ...ex[idx], status: v };
                        return { ...p, preRenewal: { ...p.preRenewal, __extra: ex } };
                      })} />
                      <button type="button" onClick={() => setData(p => ({
                        ...p, preRenewal: { ...p.preRenewal, __extra: (p.preRenewal?.__extra||[]).filter((_,i)=>i!==idx) }
                      }))} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "4px 8px",
                        cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700 }}>✕</button>
                    </div>
                    {!isNA && (
                      <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Assignee
                          <select value={t.assignee||""} onChange={e => setData(p => {
                            const ex=[...(p.preRenewal?.__extra||[])]; ex[idx]={...ex[idx],assignee:e.target.value};
                            return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                          })} style={{ ...inputStyle, marginTop: 3 }}>
                            <option value="">— Unassigned —</option>
                            {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Due Date
                          <input type="date" value={t.dueDate||""} onChange={e => setData(p => {
                            const ex=[...(p.preRenewal?.__extra||[])]; ex[idx]={...ex[idx],dueDate:e.target.value};
                            return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                          })} style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Date Completed
                          <input type="date" value={t.completedDate||""} onChange={e => {
                            const val=e.target.value;
                            setData(p => { const ex=[...(p.preRenewal?.__extra||[])]; ex[idx]={...ex[idx],completedDate:val,status:val?"Complete":ex[idx].status}; return {...p,preRenewal:{...p.preRenewal,__extra:ex}}; });
                          }} style={{ ...inputStyle, marginTop: 3, background: t.completedDate?"#f0fdf4":"#fff", borderColor: t.completedDate?"#86efac":undefined }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Notes
                          <input type="text" value={t.notes||""} onChange={e => setData(p => {
                            const ex=[...(p.preRenewal?.__extra||[])]; ex[idx]={...ex[idx],notes:e.target.value};
                            return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                          })} placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                      </div>
                      {/* Follow-ups */}
                      <FollowUpBlock
                        followUps={(t.followUps||[])}
                        onAdd={() => setData(p => {
                          const ex=[...(p.preRenewal?.__extra||[])];
                          ex[idx]={...ex[idx],followUps:[...(ex[idx].followUps||[]),{id:Date.now(),date:new Date().toISOString().split("T")[0],note:""}]};
                          return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                        })}
                        onChangeDate={(fi, v) => setData(p => {
                          const ex=[...(p.preRenewal?.__extra||[])]; const fus=[...(ex[idx].followUps||[])];
                          fus[fi]={...fus[fi],date:v}; ex[idx]={...ex[idx],followUps:fus};
                          return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                        })}
                        onChangeNote={(fi, v) => setData(p => {
                          const ex=[...(p.preRenewal?.__extra||[])]; const fus=[...(ex[idx].followUps||[])];
                          fus[fi]={...fus[fi],note:v}; ex[idx]={...ex[idx],followUps:fus};
                          return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                        })}
                        onRemove={(fi) => setData(p => {
                          const ex=[...(p.preRenewal?.__extra||[])];
                          ex[idx]={...ex[idx],followUps:(ex[idx].followUps||[]).filter((_,i)=>i!==fi)};
                          return {...p,preRenewal:{...p.preRenewal,__extra:ex}};
                        })}
                      />
                      </>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, preRenewal: { ...p.preRenewal, __extra: [...(p.preRenewal?.__extra||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", followUps:[] }] }
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #507c9c", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Task
              </button>
            </div>

          </div>)} {/* end preRenewal tab */}

          {/* Renewal */}
          {taskTab === "renewal" && (<div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
              {/* ── Schedule Renewal Meeting — fixed task ── */}
              {(() => {
                const rm = data.renewalMeeting || {};
                const status = rm.status || "Not Started";
                const isDone = status === "Complete";
                const isNA  = status === "N/A";
                const setRM = (field, val) => setData(p => ({
                  ...p,
                  renewalMeeting: { ...(p.renewalMeeting || {}), [field]: val },
                }));
                return (
                  <div style={{
                    background: isDone ? "#f0fdf4" : isNA ? "#f8fafc" : "#f8fafc",
                    borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                    border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : status === "In Progress" ? "#fde68a" : "#e2e8f0"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: isDone ? "#166534" : isNA ? "#94a3b8" : "#0f172a",
                        flex: 1, marginRight: 10 }}>Schedule Renewal Meeting</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button type="button"
                          onClick={() => setRM("status", isNA ? "Not Started" : "N/A")}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                            background: isNA ? "#f1f5f9" : "#fff",
                            color: isNA ? "#64748b" : "#94a3b8",
                            cursor: "pointer", fontFamily: "inherit" }}>N/A</button>
                        <StatusSelect value={status} onChange={v => setRM("status", v)} />
                      </div>
                    </div>
                    {!isNA && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Assignee
                            <select value={rm.assignee || ""} onChange={e => setRM("assignee", e.target.value)}
                              style={{ ...inputStyle, marginTop: 3 }}>
                              <option value="">— Unassigned —</option>
                              {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Due Date
                            <input type="date" value={rm.dueDate || ""} onChange={e => setRM("dueDate", e.target.value)}
                              style={{ ...inputStyle, marginTop: 3 }} />
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Date Completed
                            <input type="date" value={rm.completedDate || ""}
                              onChange={e => { const v = e.target.value; setRM("completedDate", v); if (v) setRM("status", "Complete"); }}
                              style={{ ...inputStyle, marginTop: 3,
                                background: rm.completedDate ? "#f0fdf4" : "#fff",
                                borderColor: rm.completedDate ? "#86efac" : undefined }} />
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Notes
                            <input type="text" value={rm.notes || ""} onChange={e => setRM("notes", e.target.value)}
                              placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                          </label>
                        </div>
                        {/* Meeting type */}
                        <div style={{ background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".8px",
                            textTransform: "uppercase", marginBottom: 8 }}>Meeting Type</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                            {["In Person", "Virtual", "E-mail Only"].map(opt => (
                              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                <input type="radio" name={`rm_type_${data.id}`}
                                  checked={rm.meetingType === opt}
                                  onChange={() => setRM("meetingType", opt)}
                                  style={{ accentColor: "#507c9c", width: 13, height: 13 }} />
                                <span style={{ fontSize: 12, fontWeight: rm.meetingType === opt ? 700 : 400,
                                  color: rm.meetingType === opt ? "#3e5878" : "#64748b" }}>{opt}</span>
                              </label>
                            ))}
                            {rm.meetingType === "Virtual" && (
                              <div style={{ display: "flex", gap: 12, marginLeft: 8 }}>
                                {["Zoom", "Teams"].map(platform => (
                                  <label key={platform} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                    <input type="radio" name={`rm_platform_${data.id}`}
                                      checked={rm.virtualPlatform === platform}
                                      onChange={() => setRM("virtualPlatform", platform)}
                                      style={{ accentColor: "#507c9c", width: 13, height: 13 }} />
                                    <span style={{ fontSize: 12, fontWeight: rm.virtualPlatform === platform ? 700 : 400,
                                      color: rm.virtualPlatform === platform ? "#3e5878" : "#64748b" }}>{platform}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          {rm.meetingType && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Meeting Date
                                <input type="date" value={rm.meetingDate || ""}
                                  onChange={e => setRM("meetingDate", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3 }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Meeting Time
                                <input type="time" value={rm.meetingTime || ""}
                                  onChange={e => setRM("meetingTime", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3 }} />
                              </label>
                            </div>
                          )}
                        </div>
                        {/* Follow-ups */}
                        <FollowUpBlock
                          followUps={(rm.followUps||[])}
                          onAdd={() => setRM("followUps", [...(rm.followUps||[]), {id:Date.now(), date:new Date().toISOString().split("T")[0], note:""}])}
                          onChangeDate={(fi, v) => { const fus=[...(rm.followUps||[])]; fus[fi]={...fus[fi],date:v}; setRM("followUps", fus); }}
                          onChangeNote={(fi, v) => { const fus=[...(rm.followUps||[])]; fus[fi]={...fus[fi],note:v}; setRM("followUps", fus); }}
                          onRemove={(fi) => setRM("followUps", (rm.followUps||[]).filter((_,i)=>i!==fi))}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* ── Auto-generated tasks from benefit decisions ── */}
              {(() => {
                const decisions = data.benefitDecision || {};
                const isBCBSIL = (catId) => {
                  const c = (data.benefitCarriers || {})[catId] || "";
                  return c === "BCBSIL" || c === "BCBS ?";
                };
                const fullyInsured = data.fundingMethod === "Fully Insured";
                let bpsDueDate = "";
                if (data.renewalDate) {
                  const d = new Date(data.renewalDate);
                  d.setDate(d.getDate() - 30);
                  bpsDueDate = d.toISOString().split("T")[0];
                }
                const autoTasks = [];
                BENEFITS_SCHEMA.forEach(cat => {
                  const dec = decisions[cat.id];
                  if (!dec) return;
                  if (dec === "change_plans") {
                    if (fullyInsured && isBCBSIL(cat.id)) {
                      autoTasks.push({ key: `bps_${cat.id}`, title: "Prepare and Submit BPS", benefit: cat.label, defaultDue: bpsDueDate });
                    } else {
                      autoTasks.push({ key: `pcr_${cat.id}`, title: "Submit Plan Change Request", benefit: cat.label, defaultDue: "" });
                    }
                  }
                  if (dec === "change_carrier") {
                    autoTasks.push({ key: `ncp_${cat.id}`, title: "New Carrier Paperwork", benefit: cat.label, defaultDue: "" });
                    autoTasks.push({ key: `tl_${cat.id}`,  title: "Termination Letter",     benefit: cat.label, defaultDue: "" });
                  }
                });
                // BPA: always generate when medical carrier is BCBSIL and bundled discount is checked
                if (data.bundledDiscount && isBCBSIL("medical") && !autoTasks.find(t => t.key === "bpa_medical")) {
                  autoTasks.push({ key: "bpa_medical", title: "Prepare and Submit BPA", benefit: "Medical", defaultDue: "" });
                }
                if (autoTasks.length === 0) return null;
                const autoStore = data.renewalTasksAuto || {};
                const setAutoTask = (key, field, val) => {
                  setData(p => ({
                    ...p,
                    renewalTasksAuto: {
                      ...(p.renewalTasksAuto || {}),
                      [key]: { ...(p.renewalTasksAuto?.[key] || {}), [field]: val },
                    },
                  }));
                };
                return (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#507c9c", letterSpacing: "1px",
                      textTransform: "uppercase", marginBottom: 2 }}>Auto-generated from Benefit Decisions</div>
                    {autoTasks.map(at => {
                      const stored = autoStore[at.key] || {};
                      const status = stored.status || "Not Started";
                      const isDone = status === "Complete";
                      const isNA  = status === "N/A";
                      const dueDate = stored.dueDate !== undefined ? stored.dueDate : at.defaultDue;
                      return (
                        <div key={at.key} style={{
                          background: isDone ? "#f0fdf4" : isNA ? "#f8fafc" : "#eef2ff",
                          borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                          border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : "#507c9c"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                            <div style={{ flex: 1, marginRight: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: isDone ? "#166534" : isNA ? "#94a3b8" : "#3e5878" }}>
                                {at.title}
                              </span>
                              <span style={{ fontSize: 11, fontWeight: 500, color: "#507c9c", marginLeft: 8 }}>({at.benefit})</span>
                              <span style={{ fontSize: 10, background: "#dce8f2", color: "#3e5878",
                                borderRadius: 99, padding: "1px 7px", fontWeight: 700, marginLeft: 8 }}>AUTO</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <button type="button"
                                onClick={() => setAutoTask(at.key, "status", isNA ? "Not Started" : "N/A")}
                                style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                  border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                                  background: isNA ? "#f1f5f9" : "#fff",
                                  color: isNA ? "#64748b" : "#94a3b8",
                                  cursor: "pointer", fontFamily: "inherit" }}>N/A</button>
                              <StatusSelect value={status} onChange={v => setAutoTask(at.key, "status", v)} />
                            </div>
                          </div>
                          {!isNA && (
                            <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Assignee
                                <select value={stored.assignee || ""}
                                  onChange={e => setAutoTask(at.key, "assignee", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3 }}>
                                  <option value="">— Unassigned —</option>
                                  {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Due Date
                                <input type="date" value={dueDate}
                                  onChange={e => setAutoTask(at.key, "dueDate", e.target.value)}
                                  style={{ ...inputStyle, marginTop: 3 }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Date Completed
                                <input type="date" value={stored.completedDate || ""}
                                  onChange={e => {
                                    const v = e.target.value;
                                    setAutoTask(at.key, "completedDate", v);
                                    if (v) setAutoTask(at.key, "status", "Complete");
                                  }}
                                  style={{ ...inputStyle, marginTop: 3,
                                    background: stored.completedDate ? "#f0fdf4" : "#fff",
                                    borderColor: stored.completedDate ? "#86efac" : undefined }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>
                                Notes
                                <input type="text" value={stored.notes || ""}
                                  onChange={e => setAutoTask(at.key, "notes", e.target.value)}
                                  placeholder="Notes..."
                                  style={{ ...inputStyle, marginTop: 3 }} />
                              </label>
                            </div>
                            {/* Follow-ups */}
                            <FollowUpBlock
                              followUps={(stored.followUps||[])}
                              onAdd={() => setAutoTask(at.key, "followUps", [...(stored.followUps||[]), {id:Date.now(), date:new Date().toISOString().split("T")[0], note:""}])}
                              onChangeDate={(fi, v) => { const fus=[...(stored.followUps||[])]; fus[fi]={...fus[fi],date:v}; setAutoTask(at.key, "followUps", fus); }}
                              onChangeNote={(fi, v) => { const fus=[...(stored.followUps||[])]; fus[fi]={...fus[fi],note:v}; setAutoTask(at.key, "followUps", fus); }}
                              onRemove={(fi) => setAutoTask(at.key, "followUps", (stored.followUps||[]).filter((_,i)=>i!==fi))}
                            />
                             </>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
              {(data.renewalTasks || []).map((t, idx) => {
                const isNA = t.status === "N/A";
                const isDone = t.status === "Complete";
                return (
                  <div key={"rt_"+idx} style={{
                    background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                    borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                    border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : t.status === "In Progress" ? "#fde68a" : "#ccdaeb"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                      <input
                        type="text"
                        value={t.title || ""}
                        onChange={e => setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], title: e.target.value }; return { ...p, renewalTasks: rt }; })}
                        placeholder="Task name..."
                        style={{ ...inputStyle, marginTop: 0, flex: 1, marginRight: 10, fontWeight: 700, fontSize: 13 }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button type="button"
                          onClick={() => setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], status: isNA ? "Not Started" : "N/A" }; return { ...p, renewalTasks: rt }; })}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                            background: isNA ? "#f1f5f9" : "#fff",
                            color: isNA ? "#64748b" : "#94a3b8",
                            cursor: "pointer", fontFamily: "inherit" }}>N/A</button>
                        <StatusSelect value={t.status} onChange={v => setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], status: v }; return { ...p, renewalTasks: rt }; })} />
                        <button type="button"
                          onClick={() => setData(p => ({ ...p, renewalTasks: (p.renewalTasks||[]).filter((_,i) => i !== idx) }))}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                            cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                      </div>
                    </div>
                    {!isNA && (
                      <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Assignee
                          <select value={t.assignee || ""} onChange={e => setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], assignee: e.target.value }; return { ...p, renewalTasks: rt }; })}
                            style={{ ...inputStyle, marginTop: 3 }}>
                            <option value="">— Unassigned —</option>
                            {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Due Date
                          <input type="date" value={t.dueDate || ""}
                            onChange={e => setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], dueDate: e.target.value }; return { ...p, renewalTasks: rt }; })}
                            style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Date Completed
                          <input type="date" value={t.completedDate || ""}
                            onChange={e => {
                              const v = e.target.value;
                              setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], completedDate: v, ...(v ? { status: "Complete" } : {}) }; return { ...p, renewalTasks: rt }; });
                            }}
                            style={{ ...inputStyle, marginTop: 3,
                              background: t.completedDate ? "#f0fdf4" : "#fff",
                              borderColor: t.completedDate ? "#86efac" : undefined }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Notes
                          <input type="text" value={t.notes || ""}
                            onChange={e => setData(p => { const rt = [...(p.renewalTasks||[])]; rt[idx] = { ...rt[idx], notes: e.target.value }; return { ...p, renewalTasks: rt }; })}
                            placeholder="Notes..."
                            style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                      </div>
                      {/* Follow-ups */}
                      <FollowUpBlock
                        followUps={(t.followUps||[])}
                        onAdd={() => setData(p => {
                          const arr = [...(p.renewalTasks||[])];
                          arr[idx] = {...arr[idx], followUps: [...(arr[idx].followUps||[]), {id: Date.now(), date: new Date().toISOString().split("T")[0], note: ""}]};
                          return {...p, renewalTasks: arr};
                        })}
                        onChangeDate={(fi, v) => setData(p => {
                          const arr = [...(p.renewalTasks||[])]; const fus = [...(arr[idx].followUps||[])];
                          fus[fi] = {...fus[fi], date: v}; arr[idx] = {...arr[idx], followUps: fus};
                          return {...p, renewalTasks: arr};
                        })}
                        onChangeNote={(fi, v) => setData(p => {
                          const arr = [...(p.renewalTasks||[])]; const fus = [...(arr[idx].followUps||[])];
                          fus[fi] = {...fus[fi], note: v}; arr[idx] = {...arr[idx], followUps: fus};
                          return {...p, renewalTasks: arr};
                        })}
                        onRemove={(fi) => setData(p => {
                          const arr = [...(p.renewalTasks||[])];
                          arr[idx] = {...arr[idx], followUps: (arr[idx].followUps||[]).filter((_,i)=>i!==fi)};
                          return {...p, renewalTasks: arr};
                        })}
                      />
                      </>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, renewalTasks: [...(p.renewalTasks||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", notes:"", followUps:[] }]
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Task
              </button>
            </div>

          </div>)} {/* end renewal tab */}

          {/* Open Enrollment */}
          {taskTab === "oe" && (<div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>

              {/* 1. OE Dates */}
              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>1. OE Dates</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    Start Date
                    <input type="date" value={oe.oeStartDate || ""} onChange={e => setOE("oeStartDate", e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />
                  </label>
                  <label style={{ ...labelStyle, marginTop: 0 }}>
                    End Date
                    <input type="date" value={oe.oeEndDate || ""} onChange={e => setOE("oeEndDate", e.target.value)} style={{ ...inputStyle, marginTop: 3 }} />
                  </label>
                </div>
              </div>

              {/* 2. OE Communication */}
              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>2. OE Communication</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { val: "inperson",  label: "In-Person Meeting" },
                    { val: "virtual",   label: "Virtual Meeting" },
                    { val: "materials", label: "Materials Only" },
                  ].map(opt => (
                    <button key={opt.val} type="button"
                      onClick={() => setOE("commType", oe.commType === opt.val ? "" : opt.val)}
                      style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${oe.commType === opt.val ? "#3b82f6" : "#e2e8f0"}`,
                        background: oe.commType === opt.val ? "#eff6ff" : "#fff",
                        color: oe.commType === opt.val ? "#1d4ed8" : "#64748b",
                        cursor: "pointer", fontFamily: "inherit",
                      }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* 3. OE Type */}
              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>3. OE Type</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { val: "active",  label: "Active" },
                    { val: "passive", label: "Passive" },
                  ].map(opt => (
                    <button key={opt.val} type="button"
                      onClick={() => setOE("oeType", oe.oeType === opt.val ? "" : opt.val)}
                      style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${oe.oeType === opt.val ? "#3b82f6" : "#e2e8f0"}`,
                        background: oe.oeType === opt.val ? "#eff6ff" : "#fff",
                        color: oe.oeType === opt.val ? "#1d4ed8" : "#64748b",
                        cursor: "pointer", fontFamily: "inherit",
                      }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* 4. OE Materials */}
              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>4. OE Materials</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { val: "eguide", label: "E-Guide" },
                    { val: "paper",  label: "Paper Guide" },
                    { val: "memo",   label: "Memo" },
                  ].map(opt => {
                    const checked = !!(oe.materials || {})[opt.val];
                    return (
                      <button key={opt.val} type="button"
                        onClick={() => setOEMaterial(opt.val, !checked)}
                        style={{
                          padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          border: `1.5px solid ${checked ? "#3b82f6" : "#e2e8f0"}`,
                          background: checked ? "#eff6ff" : "#fff",
                          color: checked ? "#1d4ed8" : "#64748b",
                          cursor: "pointer", fontFamily: "inherit",
                        }}>{opt.label}</button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Enrollment Method */}
              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>5. Enrollment Method</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { val: "si_en",         label: "SI Enrollment Portal (EN)" },
                    { val: "si_ub",         label: "SI Enrollment Portal (UB)" },
                    { val: "client_portal", label: "Client Enrollment Portal" },
                    { val: "form",          label: "Enrollment Form" },
                  ].map(opt => (
                    <button key={opt.val} type="button"
                      onClick={() => setOE("enrollMethod", oe.enrollMethod === opt.val ? "" : opt.val)}
                      style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${oe.enrollMethod === opt.val ? "#3b82f6" : "#e2e8f0"}`,
                        background: oe.enrollMethod === opt.val ? "#eff6ff" : "#fff",
                        color: oe.enrollMethod === opt.val ? "#1d4ed8" : "#64748b",
                        cursor: "pointer", fontFamily: "inherit",
                      }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* 6. Translation Needed */}
              <div style={{ background: "#f8fafc", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "14px 16px" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>6. Translation Needed</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { val: true,  label: "Yes — Translation Required" },
                    { val: false, label: "No" },
                  ].map(opt => (
                    <button key={String(opt.val)} type="button"
                      onClick={() => setOE("translationNeeded", opt.val)}
                      style={{
                        padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: `1.5px solid ${oe.translationNeeded === opt.val ? "#3b82f6" : "#e2e8f0"}`,
                        background: oe.translationNeeded === opt.val ? "#eff6ff" : "#fff",
                        color: oe.translationNeeded === opt.val ? "#1d4ed8" : "#64748b",
                        cursor: "pointer", fontFamily: "inherit",
                      }}>{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Generated OE Tasks */}
              {(activeMaterialTasks.length > 0 || (oe.tasks?.__extra||[]).length > 0) && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#64748b", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>OE Tasks</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {activeMaterialTasks.map(t => {
                      const task = getOETask(t.id, tasksDb);
                      const isDone = task.status === "Complete";
                      return (
                        <div key={t.id} style={{
                          background: isDone ? "#f0fdf4" : "#f8fafc", borderRadius: 10, padding: "10px 14px",
                          border: `1.5px solid ${isDone ? "#86efac" : task.status === "In Progress" ? "#fde68a" : "#e2e8f0"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>{getLabelForTask(t.id, tasksDb, t.label)}</span>
                            <StatusSelect value={task.status} onChange={v => setOETask(t.id, "status", v)} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Assignee
                              <select value={task.assignee} onChange={e => setOETask(t.id, "assignee", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3 }}>
                                <option value="">— Unassigned —</option>
                                {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Due Date
                              <input type="date" value={task.dueDate}
                                onChange={e => setOETask(t.id, "dueDate", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3 }} />
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Date Completed
                              <input type="date" value={task.completedDate}
                                onChange={e => {
                                  setOETask(t.id, "completedDate", e.target.value);
                                  if (e.target.value) setOETask(t.id, "status", "Complete");
                                }}
                                style={{ ...inputStyle, marginTop: 3,
                                  background: task.completedDate ? "#f0fdf4" : "#fff",
                                  borderColor: task.completedDate ? "#86efac" : undefined }} />
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Notes
                              <input type="text" value={task.notes || ""}
                                onChange={e => setOETask(t.id, "notes", e.target.value)}
                                placeholder="Notes..."
                                style={{ ...inputStyle, marginTop: 3 }} />
                            </label>
                          </div>
                          {/* Follow-ups */}
                          <FollowUpBlock
                            followUps={(task.followUps||[])}
                            onAdd={() => setOETask(t.id, "followUps", [...(task.followUps||[]), {id:Date.now(), date:new Date().toISOString().split("T")[0], note:""}])}
                            onChangeDate={(fi, v) => { const fus=[...(task.followUps||[])]; fus[fi]={...fus[fi],date:v}; setOETask(t.id, "followUps", fus); }}
                            onChangeNote={(fi, v) => { const fus=[...(task.followUps||[])]; fus[fi]={...fus[fi],note:v}; setOETask(t.id, "followUps", fus); }}
                            onRemove={(fi) => setOETask(t.id, "followUps", (task.followUps||[]).filter((_,i)=>i!==fi))}
                          />
                        </div>
                      );
                    })}
                    {/* Manual OE extra tasks */}
                    {(oe.tasks?.__extra || []).map((t, idx) => {
                      const isNA = t.status === "N/A";
                      const isDone = t.status === "Complete";
                      return (
                        <div key={"oe_extra_"+idx} style={{
                          background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                          borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                          border: `1.5px solid ${isDone ? "#86efac" : "#e2e8f0"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isNA ? 0 : 8 }}>
                            <input value={t.title||""} onChange={e => setData(p => {
                              const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; ex[idx]={...ex[idx],title:e.target.value};
                              return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                            })} placeholder="Task name..." style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 600 }} />
                            <StatusSelect value={t.status||"Not Started"} onChange={v => setData(p => {
                              const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; ex[idx]={...ex[idx],status:v};
                              return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                            })} />
                            <button type="button" onClick={() => setData(p => ({
                              ...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:(p.openEnrollment?.tasks?.__extra||[]).filter((_,i)=>i!==idx)}}
                            }))} style={{ background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700 }}>✕</button>
                          </div>
                          {!isNA && (
                            <>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                              <label style={{ ...labelStyle, marginTop: 0 }}>Assignee
                                <select value={t.assignee||""} onChange={e => setData(p => {
                                  const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; ex[idx]={...ex[idx],assignee:e.target.value};
                                  return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                                })} style={{ ...inputStyle, marginTop: 3 }}>
                                  <option value="">— Unassigned —</option>
                                  {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>Due Date
                                <input type="date" value={t.dueDate||""} onChange={e => setData(p => {
                                  const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; ex[idx]={...ex[idx],dueDate:e.target.value};
                                  return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                                })} style={{ ...inputStyle, marginTop: 3 }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>Date Completed
                                <input type="date" value={t.completedDate||""} onChange={e => {
                                  const val=e.target.value;
                                  setData(p => { const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; ex[idx]={...ex[idx],completedDate:val,status:val?"Complete":ex[idx].status}; return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}}; });
                                }} style={{ ...inputStyle, marginTop: 3, background:t.completedDate?"#f0fdf4":"#fff", borderColor:t.completedDate?"#86efac":undefined }} />
                              </label>
                              <label style={{ ...labelStyle, marginTop: 0 }}>Notes
                                <input type="text" value={t.notes||""} onChange={e => setData(p => {
                                  const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; ex[idx]={...ex[idx],notes:e.target.value};
                                  return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                                })} placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                              </label>
                            </div>
                            {/* Follow-ups */}
                            <FollowUpBlock
                              followUps={(t.followUps||[])}
                              onAdd={() => setData(p => {
                                const ex=[...(p.openEnrollment?.tasks?.__extra||[])];
                                ex[idx]={...ex[idx],followUps:[...(ex[idx].followUps||[]),{id:Date.now(),date:new Date().toISOString().split("T")[0],note:""}]};
                                return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                              })}
                              onChangeDate={(fi, v) => setData(p => {
                                const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; const fus=[...(ex[idx].followUps||[])];
                                fus[fi]={...fus[fi],date:v}; ex[idx]={...ex[idx],followUps:fus};
                                return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                              })}
                              onChangeNote={(fi, v) => setData(p => {
                                const ex=[...(p.openEnrollment?.tasks?.__extra||[])]; const fus=[...(ex[idx].followUps||[])];
                                fus[fi]={...fus[fi],note:v}; ex[idx]={...ex[idx],followUps:fus};
                                return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                              })}
                              onRemove={(fi) => setData(p => {
                                const ex=[...(p.openEnrollment?.tasks?.__extra||[])];
                                ex[idx]={...ex[idx],followUps:(ex[idx].followUps||[]).filter((_,i)=>i!==fi)};
                                return {...p,openEnrollment:{...p.openEnrollment,tasks:{...p.openEnrollment.tasks,__extra:ex}}};
                              })}
                            />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => setData(p => ({
                ...p, openEnrollment: { ...p.openEnrollment, tasks: { ...p.openEnrollment.tasks, __extra: [...(p.openEnrollment?.tasks?.__extra||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", followUps:[] }] } }
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 8 }}>
                + Add OE Task
              </button>
            </div>

          </div>)} {/* end oe tab */}

          {/* Post-OE */}
          {taskTab === "postOE" && (<div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
              {(() => {
                // Check if any benefit has change_carrier decision
                const hasCarrierChange = Object.values(data.benefitDecision || {}).some(v => v === "change_carrier");

                const fixedTasks = [
                  { id: "elections_received",    label: "Elections Received?" },
                  { id: "oe_changes_processed",  label: "OE Changes Processed?", hasProcessMethod: true },
                  ...(hasCarrierChange ? [{ id: "new_carrier_census", label: "New Carrier Submission Census Created?" }] : []),
                  { id: "carrier_bill_audited",  label: "Carrier Bill Audited?" },
                  { id: "lineup_updated",        label: "Lineup Updated?" },
                  { id: "oe_wrapup_email",       label: "OE Wrap-Up Email Sent?" },
                ];

                const pof = data.postOEFixed || {};
                const coord = getCoordinator(data.team);
                const setPOF = (taskId, field, val, taskLabel) => setData(p => {
                  const base = p.postOEFixed?.[taskId] || {};
                  const plannedDueDate = field === "dueDate" && !base.plannedDueDate && val
                    ? val : base.plannedDueDate;
                  if (["status","dueDate","assignee","completedDate"].includes(field) && base[field] !== val) {
                    insertAuditLog({
                      clientId: p.id, clientName: p.name,
                      userName: currentUser?.name || "Unknown", userRole: currentUser?.role || "",
                      category: "Post-OE", taskLabel: taskLabel || taskId,
                      field, oldValue: base[field] ?? "", newValue: val ?? "",
                    });
                  }
                  return {
                    ...p,
                    postOEFixed: {
                      ...(p.postOEFixed || {}),
                      [taskId]: { ...base, [field]: val, ...(plannedDueDate ? { plannedDueDate } : {}) },
                    },
                  };
                });

                return fixedTasks.map(task => {
                  const defaultAssignee = (task.id === "oe_changes_processed") ? coord : "";
                  const stored = pof[task.id] || {};
                  const status = stored.status || "Not Started";
                  const isDone = status === "Complete";
                  const isNA  = status === "N/A";
                  return (
                    <div key={task.id} style={{
                      background: isDone ? "#f0fdf4" : isNA ? "#f8fafc" : "#f8fafc",
                      borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                      border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : status === "In Progress" ? "#fde68a" : "#e2e8f0"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700,
                          color: isDone ? "#166534" : isNA ? "#94a3b8" : "#0f172a",
                          flex: 1, marginRight: 10 }}>{task.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <button type="button"
                            onClick={() => setPOF(task.id, "status", isNA ? "Not Started" : "N/A")}
                            style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                              background: isNA ? "#f1f5f9" : "#fff",
                              color: isNA ? "#64748b" : "#94a3b8",
                              cursor: "pointer", fontFamily: "inherit" }}>N/A</button>
                          <StatusSelect value={status} onChange={v => setPOF(task.id, "status", v)} />
                        </div>
                      </div>
                      {!isNA && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Assignee
                              <select value={stored.assignee || defaultAssignee} onChange={e => setPOF(task.id, "assignee", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3 }}>
                                <option value="">— Unassigned —</option>
                                {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Due Date
                              <input type="date" value={stored.dueDate || ""} onChange={e => setPOF(task.id, "dueDate", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3 }} />
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Date Completed
                              <input type="date" value={stored.completedDate || ""}
                                onChange={e => { const v = e.target.value; setPOF(task.id, "completedDate", v); if (v) setPOF(task.id, "status", "Complete"); }}
                                style={{ ...inputStyle, marginTop: 3,
                                  background: stored.completedDate ? "#f0fdf4" : "#fff",
                                  borderColor: stored.completedDate ? "#86efac" : undefined }} />
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Notes
                              <input type="text" value={stored.notes || ""} onChange={e => setPOF(task.id, "notes", e.target.value)}
                                placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                            </label>
                          </div>
                          {task.hasProcessMethod && (
                            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                              background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", padding: "8px 12px" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>Method:</span>
                              {["Manually", "Census", "EDI Feed"].map(opt => (
                                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                  <input type="radio" name={`poe_method_${data.id}`}
                                    checked={stored.processMethod === opt}
                                    onChange={() => setPOF(task.id, "processMethod", opt)}
                                    style={{ accentColor: "#507c9c", width: 13, height: 13 }} />
                                  <span style={{ fontSize: 12, fontWeight: stored.processMethod === opt ? 700 : 400,
                                    color: stored.processMethod === opt ? "#3e5878" : "#64748b" }}>{opt}</span>
                                </label>
                              ))}
                            </div>
                          )}
                          {/* Follow-ups */}
                          <FollowUpBlock
                            followUps={(stored.followUps||[])}
                            onAdd={() => setPOF(task.id, "followUps", [...(stored.followUps||[]), {id:Date.now(), date:new Date().toISOString().split("T")[0], note:""}])}
                            onChangeDate={(fi, v) => { const fus=[...(stored.followUps||[])]; fus[fi]={...fus[fi],date:v}; setPOF(task.id, "followUps", fus); }}
                            onChangeNote={(fi, v) => { const fus=[...(stored.followUps||[])]; fus[fi]={...fus[fi],note:v}; setPOF(task.id, "followUps", fus); }}
                            onRemove={(fi) => setPOF(task.id, "followUps", (stored.followUps||[]).filter((_,i)=>i!==fi))}
                          />
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              {(data.postOETasks || []).map((t, idx) => {
                const isNA = t.status === "N/A";
                const isDone = t.status === "Complete";
                return (
                  <div key={"poe_"+idx} style={{
                    background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                    borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                    border: `1.5px solid ${isDone ? "#86efac" : isNA ? "#e2e8f0" : t.status === "In Progress" ? "#fde68a" : "#e2e8f0"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                      <input type="text" value={t.title || ""}
                        onChange={e => setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], title: e.target.value }; return { ...p, postOETasks: pt }; })}
                        placeholder="Task name..."
                        style={{ ...inputStyle, marginTop: 0, flex: 1, marginRight: 10, fontWeight: 700, fontSize: 13 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <button type="button"
                          onClick={() => setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], status: isNA ? "Not Started" : "N/A" }; return { ...p, postOETasks: pt }; })}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                            background: isNA ? "#f1f5f9" : "#fff", color: isNA ? "#64748b" : "#94a3b8",
                            cursor: "pointer", fontFamily: "inherit" }}>N/A</button>
                        <StatusSelect value={t.status} onChange={v => setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], status: v }; return { ...p, postOETasks: pt }; })} />
                        <button type="button"
                          onClick={() => setData(p => ({ ...p, postOETasks: (p.postOETasks||[]).filter((_,i) => i !== idx) }))}
                          style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                            cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                      </div>
                    </div>
                    {!isNA && (
                      <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Assignee
                          <select value={t.assignee || ""} onChange={e => setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], assignee: e.target.value }; return { ...p, postOETasks: pt }; })}
                            style={{ ...inputStyle, marginTop: 3 }}>
                            <option value="">— Unassigned —</option>
                            {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Due Date
                          <input type="date" value={t.dueDate || ""}
                            onChange={e => setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], dueDate: e.target.value }; return { ...p, postOETasks: pt }; })}
                            style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Date Completed
                          <input type="date" value={t.completedDate || ""}
                            onChange={e => { const v = e.target.value; setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], completedDate: v, ...(v ? { status: "Complete" } : {}) }; return { ...p, postOETasks: pt }; }); }}
                            style={{ ...inputStyle, marginTop: 3,
                              background: t.completedDate ? "#f0fdf4" : "#fff",
                              borderColor: t.completedDate ? "#86efac" : undefined }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Notes
                          <input type="text" value={t.notes || ""}
                            onChange={e => setData(p => { const pt = [...(p.postOETasks||[])]; pt[idx] = { ...pt[idx], notes: e.target.value }; return { ...p, postOETasks: pt }; })}
                            placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                      </div>
                      {/* Follow-ups */}
                      <FollowUpBlock
                        followUps={(t.followUps||[])}
                        onAdd={() => setData(p => {
                          const arr = [...(p.postOETasks||[])];
                          arr[idx] = {...arr[idx], followUps: [...(arr[idx].followUps||[]), {id: Date.now(), date: new Date().toISOString().split("T")[0], note: ""}]};
                          return {...p, postOETasks: arr};
                        })}
                        onChangeDate={(fi, v) => setData(p => {
                          const arr = [...(p.postOETasks||[])]; const fus = [...(arr[idx].followUps||[])];
                          fus[fi] = {...fus[fi], date: v}; arr[idx] = {...arr[idx], followUps: fus};
                          return {...p, postOETasks: arr};
                        })}
                        onChangeNote={(fi, v) => setData(p => {
                          const arr = [...(p.postOETasks||[])]; const fus = [...(arr[idx].followUps||[])];
                          fus[fi] = {...fus[fi], note: v}; arr[idx] = {...arr[idx], followUps: fus};
                          return {...p, postOETasks: arr};
                        })}
                        onRemove={(fi) => setData(p => {
                          const arr = [...(p.postOETasks||[])];
                          arr[idx] = {...arr[idx], followUps: (arr[idx].followUps||[]).filter((_,i)=>i!==fi)};
                          return {...p, postOETasks: arr};
                        })}
                      />
                      </>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, postOETasks: [...(p.postOETasks||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", notes:"", followUps:[] }]
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Task
              </button>
            </div>

          </div>)} {/* end postOE tab */}

          {/* Compliance */}
          {taskTab === "compliance" && (<div>
            <div style={{ padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button onClick={autoFillDueDates} type="button" style={{
                  background: "#dce8f2", border: "1.5px solid #507c9c", borderRadius: 7,
                  padding: "5px 12px", fontSize: 11, fontWeight: 700, color: "#3e5878",
                  cursor: "pointer", fontFamily: "inherit",
                }}>⚡ Auto-fill Due Dates from Renewal</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {COMPLIANCE_TASKS.map(t => {
                  const task = getTask("compliance", t.id, tasksDb);
                  const isNA = task.status === "N/A";
                  const isDone = task.status === "Complete";
                  const borderColor = isDone ? "#86efac" : isNA ? "#e2e8f0" : task.status === "In Progress" ? "#fde68a" : "#e2e8f0";
                  return (
                    <div key={t.id} style={{
                      background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                      borderRadius: 10, padding: "10px 14px",
                      border: `1.5px solid ${borderColor}`,
                      opacity: isNA ? 0.6 : 1,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isNA ? 0 : 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700,
                          textDecoration: isNA ? "line-through" : "none",
                          color: isNA ? "#94a3b8" : "#0f172a" }}>
                          {getLabelForTask(t.id, tasksDb, t.label)}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button type="button"
                            onClick={() => setTask("compliance", t.id, "status", isNA ? "Not Started" : "N/A")}
                            style={{
                              padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              border: `1.5px solid ${isNA ? "#94a3b8" : "#e2e8f0"}`,
                              background: isNA ? "#f1f5f9" : "#fff",
                              color: isNA ? "#64748b" : "#94a3b8",
                              cursor: "pointer", fontFamily: "inherit",
                            }}>N/A</button>
                          <StatusSelect value={task.status} onChange={v => setTask("compliance", t.id, "status", v)} />
                        </div>
                      </div>
                      {!isNA && (
                        <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Assignee
                            <select value={task.assignee} onChange={e => setTask("compliance", t.id, "assignee", e.target.value)}
                              style={{ ...inputStyle, marginTop: 3 }}>
                              <option value="">— Unassigned —</option>
                              {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Due Date
                            <input type="date" value={task.dueDate}
                              onChange={e => setTask("compliance", t.id, "dueDate", e.target.value)}
                              style={{ ...inputStyle, marginTop: 3 }} />
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Date Completed
                            <input type="date" value={task.completedDate || ""}
                              onChange={e => {
                                setTask("compliance", t.id, "completedDate", e.target.value);
                                if (e.target.value) setTask("compliance", t.id, "status", "Complete");
                              }}
                              style={{ ...inputStyle, marginTop: 3,
                                background: task.completedDate ? "#f0fdf4" : "#fff",
                                borderColor: task.completedDate ? "#86efac" : undefined }} />
                          </label>
                          <label style={{ ...labelStyle, marginTop: 0 }}>
                            Notes
                            <input type="text" value={task.notes || ""}
                              onChange={e => setTask("compliance", t.id, "notes", e.target.value)}
                              placeholder="Notes..."
                              style={{ ...inputStyle, marginTop: 3 }} />
                          </label>
                        </div>
                        {/* Follow-ups */}
                        <FollowUpBlock
                          followUps={(task.followUps||[])}
                          onAdd={() => setTask("compliance", t.id, "followUps", [...(task.followUps||[]), {id:Date.now(), date:new Date().toISOString().split("T")[0], note:""}])}
                          onChangeDate={(fi, v) => { const fus=[...(task.followUps||[])]; fus[fi]={...fus[fi],date:v}; setTask("compliance", t.id, "followUps", fus); }}
                          onChangeNote={(fi, v) => { const fus=[...(task.followUps||[])]; fus[fi]={...fus[fi],note:v}; setTask("compliance", t.id, "followUps", fus); }}
                          onRemove={(fi) => setTask("compliance", t.id, "followUps", (task.followUps||[]).filter((_,i)=>i!==fi))}
                        />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Manual compliance tasks */}
              {(data.compliance?.__extra || []).map((t, idx) => {
                const isNA = t.status === "N/A";
                const isDone = t.status === "Complete";
                return (
                  <div key={"comp_extra_"+idx} style={{
                    background: isNA ? "#f8fafc" : isDone ? "#f0fdf4" : "#f8fafc",
                    borderRadius: 10, padding: "10px 14px", opacity: isNA ? 0.6 : 1,
                    border: `1.5px solid ${isDone ? "#86efac" : "#e2e8f0"}`, marginTop: 8,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isNA ? 0 : 8 }}>
                      <input value={t.title||""} onChange={e => setData(p => {
                        const ex=[...(p.compliance?.__extra||[])]; ex[idx]={...ex[idx],title:e.target.value};
                        return {...p,compliance:{...p.compliance,__extra:ex}};
                      })} placeholder="Task name..." style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 600 }} />
                      <StatusSelect value={t.status||"Not Started"} onChange={v => setData(p => {
                        const ex=[...(p.compliance?.__extra||[])]; ex[idx]={...ex[idx],status:v};
                        return {...p,compliance:{...p.compliance,__extra:ex}};
                      })} />
                      <button type="button" onClick={() => setData(p => ({
                        ...p, compliance: {...p.compliance, __extra:(p.compliance?.__extra||[]).filter((_,i)=>i!==idx)}
                      }))} style={{ background:"#fee2e2",border:"none",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12,color:"#991b1b",fontWeight:700 }}>✕</button>
                    </div>
                    {!isNA && (
                      <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Assignee
                          <select value={t.assignee||""} onChange={e => setData(p => {
                            const ex=[...(p.compliance?.__extra||[])]; ex[idx]={...ex[idx],assignee:e.target.value};
                            return {...p,compliance:{...p.compliance,__extra:ex}};
                          })} style={{ ...inputStyle, marginTop: 3 }}>
                            <option value="">— Unassigned —</option>
                            {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Due Date
                          <input type="date" value={t.dueDate||""} onChange={e => setData(p => {
                            const ex=[...(p.compliance?.__extra||[])]; ex[idx]={...ex[idx],dueDate:e.target.value};
                            return {...p,compliance:{...p.compliance,__extra:ex}};
                          })} style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Date Completed
                          <input type="date" value={t.completedDate||""} onChange={e => {
                            const val=e.target.value;
                            setData(p => { const ex=[...(p.compliance?.__extra||[])]; ex[idx]={...ex[idx],completedDate:val,status:val?"Complete":ex[idx].status}; return {...p,compliance:{...p.compliance,__extra:ex}}; });
                          }} style={{ ...inputStyle, marginTop: 3, background:t.completedDate?"#f0fdf4":"#fff", borderColor:t.completedDate?"#86efac":undefined }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>Notes
                          <input type="text" value={t.notes||""} onChange={e => setData(p => {
                            const ex=[...(p.compliance?.__extra||[])]; ex[idx]={...ex[idx],notes:e.target.value};
                            return {...p,compliance:{...p.compliance,__extra:ex}};
                          })} placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                      </div>
                      {/* Follow-ups */}
                      <FollowUpBlock
                        followUps={(t.followUps||[])}
                        onAdd={() => setData(p => {
                          const ex=[...(p.compliance?.__extra||[])];
                          ex[idx]={...ex[idx],followUps:[...(ex[idx].followUps||[]),{id:Date.now(),date:new Date().toISOString().split("T")[0],note:""}]};
                          return {...p,compliance:{...p.compliance,__extra:ex}};
                        })}
                        onChangeDate={(fi, v) => setData(p => {
                          const ex=[...(p.compliance?.__extra||[])]; const fus=[...(ex[idx].followUps||[])];
                          fus[fi]={...fus[fi],date:v}; ex[idx]={...ex[idx],followUps:fus};
                          return {...p,compliance:{...p.compliance,__extra:ex}};
                        })}
                        onChangeNote={(fi, v) => setData(p => {
                          const ex=[...(p.compliance?.__extra||[])]; const fus=[...(ex[idx].followUps||[])];
                          fus[fi]={...fus[fi],note:v}; ex[idx]={...ex[idx],followUps:fus};
                          return {...p,compliance:{...p.compliance,__extra:ex}};
                        })}
                        onRemove={(fi) => setData(p => {
                          const ex=[...(p.compliance?.__extra||[])];
                          ex[idx]={...ex[idx],followUps:(ex[idx].followUps||[]).filter((_,i)=>i!==fi)};
                          return {...p,compliance:{...p.compliance,__extra:ex}};
                        })}
                      />
                      </>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, compliance: { ...p.compliance, __extra: [...(p.compliance?.__extra||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", followUps:[] }] }
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 8 }}>
                + Add Task
              </button>
            </div>

          {/* Ongoing Tasks */}
          {(() => {
            // Derive which Ongoing tasks apply to this client based on carrier/market filters
            const medCarrier = (data.benefitCarriers || {}).medical || (data.carriers || [])[0] || "";
            const medEnrolled = Number((data.benefitEnrolled || {}).medical) || 0;
            const medPlans    = (data.benefitPlans || {}).medical || [];
            const hasHMO = medPlans.some(p => p.type && p.type.toUpperCase().includes("HMO"));
            const hasPPO = medPlans.some(p => p.type && p.type.toUpperCase().includes("PPO"));

            // Evaluate custom eligibility rules beyond carrier/market/funding filters
            function passesEligibilityRule(t) {
              if (!t.eligibilityRule) return true;
              if (t.eligibilityRule === "blue_insights") {
                // Requires: ≥50 total medical enrolled AND at least one HMO or PPO plan
                return medEnrolled >= 50 && (hasHMO || hasPPO);
              }
              return true;
            }

            const applicableOngoing = (tasksDb || []).filter(t => {
              if (t.category !== "Ongoing") return false;
              if (t.markets && t.markets.length > 0 && !t.markets.includes(data.marketSize)) return false;
              if (t.carriers && t.carriers.length > 0 && !t.carriers.includes(medCarrier)) return false;
              if (t.funding  && t.funding.length  > 0 && !t.funding.includes(data.fundingMethod)) return false;
              if (!passesEligibilityRule(t)) return false;
              return true;
            });
            if (applicableOngoing.length === 0 && !((data.ongoingTasks || {}).__extra?.length)) return (
              <>
                <CollapseHeader id="ongoing" title="Ongoing Tasks" accent="#54652d" collapsed={collapsed} onToggle={toggleSection} />
                {!collapsed.ongoing && (
                  <div>
                    <button type="button" onClick={() => setData(p => ({
                      ...p, ongoingTasks: {
                        ...(p.ongoingTasks || {}),
                        __extra: [...((p.ongoingTasks || {}).__extra || []), { title: "", status: "Not Started", assignee: "", recurrence: "Monthly", lastCompleted: "", nextDue: "", notes: "" }]
                      }
                    }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: "1.5px dashed #67e8f9", background: "#f0fbff", color: "#0c4a6e",
                      cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                      + Add Ongoing Task
                    </button>
                  </div>
                )}
              </>
            );

            function advanceDate(dateStr, recurrence) {
              if (!dateStr) return "";
              const d = new Date(dateStr + "T12:00:00");
              if (recurrence === "Monthly")   d.setMonth(d.getMonth() + 1);
              else if (recurrence === "Quarterly") d.setMonth(d.getMonth() + 3);
              else if (recurrence === "Annually")  d.setFullYear(d.getFullYear() + 1);
              return d.toISOString().split("T")[0];
            }

            function setOngoing(taskId, field, val) {
              setData(p => ({
                ...p,
                ongoingTasks: {
                  ...(p.ongoingTasks || {}),
                  [taskId]: { ...(p.ongoingTasks?.[taskId] || {}), [field]: val },
                },
              }));
            }

            function completeOngoing(taskId, completedDate, recurrence) {
              const next = advanceDate(completedDate, recurrence);
              setData(p => ({
                ...p,
                ongoingTasks: {
                  ...(p.ongoingTasks || {}),
                  [taskId]: {
                    ...(p.ongoingTasks?.[taskId] || {}),
                    status: "Not Started",
                    lastCompleted: completedDate,
                    nextDue: next,
                  },
                },
              }));
            }

            return (
              <>
                <CollapseHeader id="ongoing" title="Ongoing Tasks" accent="#54652d" collapsed={collapsed} onToggle={toggleSection} />
                {!collapsed.ongoing && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {applicableOngoing.map(taskDef => {
                      const stored = (data.ongoingTasks || {})[taskDef.id] || {};
                      const status     = stored.status     || "Not Started";
                      const assignee   = stored.assignee   || resolveAssignee(taskDef.defaultAssignee || "", data.team) || "";
                      const lastComp   = stored.lastCompleted || "";
                      const nextDue    = stored.nextDue    || "";
                      const notes      = stored.notes      || "";
                      const recurrence = taskDef.recurrence || "Monthly";
                      const sc         = STATUS_STYLES[status] || STATUS_STYLES["Not Started"];
                      const isDue = nextDue && new Date(nextDue + "T12:00:00") <= new Date();

                      return (
                        <div key={taskDef.id} style={{
                          background: "#f0fbff", borderRadius: 10, padding: "12px 14px",
                          border: `1.5px solid ${isDue ? "#67e8f9" : "#bae6fd"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#0c4a6e" }}>
                                {taskDef.label}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                                background: "#e0f2fe", color: "#0369a1" }}>
                                {recurrence}
                              </span>
                              {isDue && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                                  background: "#fef3c7", color: "#92400e" }}>⏰ Due</span>
                              )}
                            </div>
                            <StatusSelect value={status} onChange={v => setOngoing(taskDef.id, "status", v)} />
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Assignee
                              <select value={assignee}
                                onChange={e => setOngoing(taskDef.id, "assignee", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3, fontSize: 12 }}>
                                <option value="">— Select —</option>
                                {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Last Completed
                              <input type="date" value={lastComp}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v) completeOngoing(taskDef.id, v, recurrence);
                                  else setOngoing(taskDef.id, "lastCompleted", "");
                                }}
                                style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Next Due
                              <input type="date" value={nextDue}
                                onChange={e => setOngoing(taskDef.id, "nextDue", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3, fontSize: 12,
                                  background: isDue ? "#fff7ed" : undefined }} />
                            </label>
                          </div>

                          <label style={{ ...labelStyle, marginTop: 8 }}>
                            Notes
                            <input type="text" value={notes}
                              onChange={e => setOngoing(taskDef.id, "notes", e.target.value)}
                              placeholder="Notes…"
                              style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                          </label>
                        </div>
                      );
                    })}

                    {/* Manual / extra ongoing tasks */}
                    {((data.ongoingTasks || {}).__extra || []).map((t, idx) => {
                      const isDue = t.nextDue && new Date(t.nextDue + "T12:00:00") <= new Date();
                      function setExtraOngoing(field, val) {
                        setData(p => {
                          const ex = [...((p.ongoingTasks || {}).__extra || [])];
                          ex[idx] = { ...ex[idx], [field]: val };
                          return { ...p, ongoingTasks: { ...(p.ongoingTasks || {}), __extra: ex } };
                        });
                      }
                      return (
                        <div key={"ong_extra_"+idx} style={{
                          background: "#f0fbff", borderRadius: 10, padding: "12px 14px",
                          border: `1.5px solid ${isDue ? "#67e8f9" : "#bae6fd"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <input value={t.title || ""} onChange={e => setExtraOngoing("title", e.target.value)}
                              placeholder="Task name..."
                              style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 600, fontSize: 13 }} />
                            <select value={t.recurrence || "Monthly"} onChange={e => setExtraOngoing("recurrence", e.target.value)}
                              style={{ ...inputStyle, marginTop: 0, width: 120, fontSize: 12 }}>
                              {["Monthly","Quarterly","Annually"].map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <StatusSelect value={t.status || "Not Started"} onChange={v => setExtraOngoing("status", v)} />
                            <button type="button" onClick={() => setData(p => ({
                              ...p, ongoingTasks: { ...(p.ongoingTasks || {}), __extra: ((p.ongoingTasks || {}).__extra || []).filter((_,i) => i !== idx) }
                            }))} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "4px 8px",
                              cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700 }}>✕</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Assignee
                              <select value={t.assignee || ""} onChange={e => setExtraOngoing("assignee", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3, fontSize: 12 }}>
                                <option value="">— Select —</option>
                                {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Last Completed
                              <input type="date" value={t.lastCompleted || ""} onChange={e => {
                                const v = e.target.value;
                                if (!v) { setExtraOngoing("lastCompleted", ""); return; }
                                const d = new Date(v + "T12:00:00");
                                const rec = t.recurrence || "Monthly";
                                if (rec === "Monthly")   d.setMonth(d.getMonth() + 1);
                                else if (rec === "Quarterly") d.setMonth(d.getMonth() + 3);
                                else if (rec === "Annually")  d.setFullYear(d.getFullYear() + 1);
                                const next = d.toISOString().split("T")[0];
                                setData(p => {
                                  const ex = [...((p.ongoingTasks || {}).__extra || [])];
                                  ex[idx] = { ...ex[idx], lastCompleted: v, nextDue: next, status: "Not Started" };
                                  return { ...p, ongoingTasks: { ...(p.ongoingTasks || {}), __extra: ex } };
                                });
                              }} style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                            </label>
                            <label style={{ ...labelStyle, marginTop: 0 }}>
                              Next Due
                              <input type="date" value={t.nextDue || ""} onChange={e => setExtraOngoing("nextDue", e.target.value)}
                                style={{ ...inputStyle, marginTop: 3, fontSize: 12, background: isDue ? "#fff7ed" : undefined }} />
                            </label>
                          </div>
                          <label style={{ ...labelStyle, marginTop: 8 }}>
                            Notes
                            <input type="text" value={t.notes || ""} onChange={e => setExtraOngoing("notes", e.target.value)}
                              placeholder="Notes…" style={{ ...inputStyle, marginTop: 3, fontSize: 12 }} />
                          </label>
                        </div>
                      );
                    })}

                    <button type="button" onClick={() => setData(p => ({
                      ...p, ongoingTasks: {
                        ...(p.ongoingTasks || {}),
                        __extra: [...((p.ongoingTasks || {}).__extra || []), { title: "", status: "Not Started", assignee: "", recurrence: "Monthly", lastCompleted: "", nextDue: "", notes: "" }]
                      }
                    }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: "1.5px dashed #67e8f9", background: "#f0fbff", color: "#0c4a6e",
                      cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                      + Add Ongoing Task
                    </button>
                  </div>
                )}
              </>
            );
          })()}

          </div>)} {/* end compliance tab */}

          {/* Miscellaneous */}
          {taskTab === "misc" && (<div>
            <div style={{ padding: "8px 0" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(data.miscTasks || []).map((t, idx) => {
                  const isDone = t.status === "Complete";
                  const isStd = !!t._standardTemplateId;
                  return (
                    <div key={idx} style={{
                      background: isDone ? "#f0fdf4" : "#f8fafc", borderRadius: 10, padding: "10px 14px",
                      border: `1.5px solid ${isDone ? "#86efac" : t.status === "In Progress" ? "#fde68a" : isStd ? "#93c5fd" : "#e2e8f0"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        {isStd ? (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "#1e40af", flex: 1 }}>{t.title}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                              background: "#dbeafe", color: "#1d4ed8", flexShrink: 0 }}>Standard</span>
                          </div>
                        ) : (
                          <input
                            value={t.title || ""}
                            onChange={e => setData(p => {
                              const tasks = [...(p.miscTasks||[])];
                              tasks[idx] = { ...tasks[idx], title: e.target.value };
                              return { ...p, miscTasks: tasks };
                            })}
                            placeholder="Task name..."
                            style={{ ...inputStyle, marginTop: 0, flex: 1, fontWeight: 600 }}
                          />
                        )}
                        <StatusSelect value={t.status || "Not Started"} onChange={v => setData(p => {
                          const tasks = [...(p.miscTasks||[])];
                          tasks[idx] = { ...tasks[idx], status: v };
                          return { ...p, miscTasks: tasks };
                        })} />
                        {!isStd && <button type="button" onClick={() => setData(p => ({
                          ...p, miscTasks: (p.miscTasks||[]).filter((_,i) => i !== idx)
                        }))} style={{
                          background: "#fee2e2", border: "none", borderRadius: 6, padding: "4px 8px",
                          cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700,
                        }}>✕</button>}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Assignee
                          <select value={t.assignee||""} onChange={e => setData(p => {
                            const tasks = [...(p.miscTasks||[])];
                            tasks[idx] = { ...tasks[idx], assignee: e.target.value };
                            return { ...p, miscTasks: tasks };
                          })} style={{ ...inputStyle, marginTop: 3 }}>
                            <option value="">— Unassigned —</option>
                            {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Due Date
                          <input type="date" value={t.dueDate||""} onChange={e => setData(p => {
                            const tasks = [...(p.miscTasks||[])];
                            tasks[idx] = { ...tasks[idx], dueDate: e.target.value };
                            return { ...p, miscTasks: tasks };
                          })} style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Date Completed
                          <input type="date" value={t.completedDate||""} onChange={e => {
                            const val = e.target.value;
                            setData(p => {
                              const tasks = [...(p.miscTasks||[])];
                              tasks[idx] = { ...tasks[idx], completedDate: val, status: val ? "Complete" : tasks[idx].status };
                              return { ...p, miscTasks: tasks };
                            });
                          }} style={{ ...inputStyle, marginTop: 3,
                            background: t.completedDate ? "#f0fdf4" : "#fff",
                            borderColor: t.completedDate ? "#86efac" : undefined }} />
                        </label>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          Notes
                          <input type="text" value={t.notes||""} onChange={e => setData(p => {
                            const tasks = [...(p.miscTasks||[])];
                            tasks[idx] = { ...tasks[idx], notes: e.target.value };
                            return { ...p, miscTasks: tasks };
                          })} placeholder="Notes..." style={{ ...inputStyle, marginTop: 3 }} />
                        </label>
                      </div>
                      {/* Follow-ups */}
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".6px" }}>
                            Follow-ups {(t.followUps||[]).length > 0 ? `(${(t.followUps||[]).length})` : ""}
                          </span>
                          <button type="button" onClick={() => setData(p => {
                            const tasks = [...(p.miscTasks||[])];
                            const fu = { id: Date.now(), date: new Date().toISOString().split("T")[0], note: "" };
                            tasks[idx] = { ...tasks[idx], followUps: [...(tasks[idx].followUps||[]), fu] };
                            return { ...p, miscTasks: tasks };
                          })} style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", background: "#dbeafe",
                            border: "none", borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontFamily: "inherit" }}>
                            + Follow-up
                          </button>
                        </div>
                        {(t.followUps||[]).map((fu, fi) => (
                          <div key={fu.id || fi} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                            <input type="date" value={fu.date||""}
                              onChange={e => setData(p => {
                                const tasks = [...(p.miscTasks||[])];
                                const fus = [...(tasks[idx].followUps||[])];
                                fus[fi] = { ...fus[fi], date: e.target.value };
                                tasks[idx] = { ...tasks[idx], followUps: fus };
                                return { ...p, miscTasks: tasks };
                              })}
                              style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, width: 140, flexShrink: 0 }} />
                            <input type="text" value={fu.note||""}
                              onChange={e => setData(p => {
                                const tasks = [...(p.miscTasks||[])];
                                const fus = [...(tasks[idx].followUps||[])];
                                fus[fi] = { ...fus[fi], note: e.target.value };
                                tasks[idx] = { ...tasks[idx], followUps: fus };
                                return { ...p, miscTasks: tasks };
                              })}
                              placeholder="Follow-up note..."
                              style={{ ...inputStyle, marginTop: 0, padding: "3px 6px", fontSize: 11, flex: 1 }} />
                            <button type="button" onClick={() => setData(p => {
                              const tasks = [...(p.miscTasks||[])];
                              tasks[idx] = { ...tasks[idx], followUps: (tasks[idx].followUps||[]).filter((_,i)=>i!==fi) };
                              return { ...p, miscTasks: tasks };
                            })} style={{ padding: "3px 6px", borderRadius: 5, fontSize: 10, border: "1.5px solid #fca5a5",
                              background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setData(p => ({
                ...p,
                miscTasks: [...(p.miscTasks||[]), { id: Date.now(), title: "", status: "Not Started", assignee: "", dueDate: "", completedDate: "", notes: "", followUps: [] }]
              }))} style={{
                marginTop: 8, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #c4b5fd", background: "#faf5ff", color: "#7c3aed",
                cursor: "pointer", fontFamily: "inherit", width: "100%",
              }}>+ Add Miscellaneous Task</button>
            </div>
          </div>)} {/* end misc tab */}

          {/* Transactions */}
          {taskTab === "transactions" && (<div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
              {/* Email drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background="#fce7f3"; e.currentTarget.style.borderColor="#f472b6"; }}
                onDragLeave={e => { e.currentTarget.style.background="#fdf4ff"; e.currentTarget.style.borderColor="#f0abfc"; }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.style.background="#fdf4ff";
                  e.currentTarget.style.borderColor="#f0abfc";
                  const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text") || "";
                  const today = new Date().toISOString().split("T")[0];
                  const newTxn = {
                    id: Date.now(), label: text ? text.slice(0, 120) : "Enrollment Change",
                    memberName: "", changeType: "", receivedDate: today,
                    status: "Not Started", assignee: getCoordinator(data.team),
                    dueDate: addBizDays(today, 3), completedDate: "",
                    notes: text || "", followUps: [],
                  };
                  setData(p => ({ ...p, transactions: [...(p.transactions||[]), newTxn] }));
                }}
                style={{ border: "2px dashed #f0abfc", borderRadius: 10, background: "#fdf4ff",
                  padding: "14px", textAlign: "center", color: "#9d174d", fontSize: 12, fontWeight: 600, cursor: "default" }}>
                📧 Drag & drop an e-mail here to auto-create a transaction task
              </div>

              <button type="button" onClick={() => {
                const today = new Date().toISOString().split("T")[0];
                setData(p => ({
                  ...p,
                  transactions: [...(p.transactions||[]), {
                    id: Date.now(), label: "", memberName: "", changeType: "",
                    receivedDate: today, status: "Not Started",
                    assignee: getCoordinator(p.team),
                    dueDate: addBizDays(today, 3), completedDate: "", notes: "", followUps: [],
                  }],
                }));
              }} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #f472b6", background: "#fdf4ff", color: "#9d174d",
                cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
                + Add Transaction
              </button>

              {(data.transactions||[]).length === 0 && (
                <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: "12px 0", fontStyle: "italic" }}>
                  No transactions yet. Add one manually or drag an e-mail above.
                </div>
              )}

              {(data.transactions||[]).map((txn, ti) => (
                <div key={txn.id || ti} style={{ background: "#fdf4ff", borderRadius: 10, border: "1.5px solid #f0abfc", padding: "12px 14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Member Name
                      <input value={txn.memberName||""} placeholder="Employee / Dependent"
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,memberName:e.target.value,label:[e.target.value,t.changeType].filter(Boolean).join(' – ')}:t) }))}
                        style={{ ...inputStyle, marginTop: 3 }} />
                    </label>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Change Type
                      <select value={txn.changeType||""}
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,changeType:e.target.value,label:[t.memberName,e.target.value].filter(Boolean).join(' – ')}:t) }))}
                        style={{ ...inputStyle, marginTop: 3 }}>
                        <option value="">— Select —</option>
                        {["New Enrollment","Termination","Qualifying Event","Dependent Add","Dependent Remove","Address Change","Plan Change","Beneficiary Change","COBRA","Other"].map(o=><option key={o}>{o}</option>)}
                      </select>
                    </label>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Date Received
                      <input type="date" value={txn.receivedDate||""}
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,receivedDate:e.target.value}:t) }))}
                        style={{ ...inputStyle, marginTop: 3 }} />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Description
                      <input value={txn.label||""} placeholder="Brief description..."
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,label:e.target.value}:t) }))}
                        style={{ ...inputStyle, marginTop: 3 }} />
                    </label>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Assignee
                      <select value={txn.assignee||""}
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,assignee:e.target.value}:t) }))}
                        style={{ ...inputStyle, marginTop: 3 }}>
                        <option value="">— Unassigned —</option>
                        {teamMembers.map(m=><option key={m}>{m}</option>)}
                      </select>
                    </label>
                    <label style={{ ...labelStyle, marginTop: 0 }}>
                      Due Date
                      <input type="date" value={txn.dueDate||""}
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,dueDate:e.target.value}:t) }))}
                        style={{ ...inputStyle, marginTop: 3 }} />
                    </label>
                    <div style={{ ...labelStyle, marginTop: 0 }}>
                      Status
                      <div style={{ marginTop: 5 }}>
                        <StatusSelect value={txn.status||"Not Started"}
                          onChange={v => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,status:v}:t) }))} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", flex: 1, marginRight: 8 }}>
                      Notes
                      <input value={txn.notes||""} placeholder="Additional notes..."
                        onChange={e => setData(p => ({ ...p, transactions: p.transactions.map((t,i)=>i===ti?{...t,notes:e.target.value}:t) }))}
                        style={{ ...inputStyle, marginTop: 3, fontSize: 11 }} />
                    </label>
                    <button type="button" onClick={() => {
                      if (confirm("Remove this transaction?"))
                        setData(p => ({ ...p, transactions: p.transactions.filter((_,i)=>i!==ti) }));
                    }} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 16,
                      border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                      cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                  </div>
                  <>
                  {/* Follow-ups */}
                  <FollowUpBlock
                    followUps={(txn.followUps||[])}
                    onAdd={() => setData(p => {
                      const arr=[...p.transactions];
                      arr[ti]={...arr[ti],followUps:[...(arr[ti].followUps||[]),{id:Date.now(),date:new Date().toISOString().split("T")[0],note:""}]};
                      return {...p,transactions:arr};
                    })}
                    onChangeDate={(fi, v) => setData(p => {
                      const arr=[...p.transactions]; const fus=[...(arr[ti].followUps||[])];
                      fus[fi]={...fus[fi],date:v}; arr[ti]={...arr[ti],followUps:fus};
                      return {...p,transactions:arr};
                    })}
                    onChangeNote={(fi, v) => setData(p => {
                      const arr=[...p.transactions]; const fus=[...(arr[ti].followUps||[])];
                      fus[fi]={...fus[fi],note:v}; arr[ti]={...arr[ti],followUps:fus};
                      return {...p,transactions:arr};
                    })}
                    onRemove={(fi) => setData(p => {
                      const arr=[...p.transactions];
                      arr[ti]={...arr[ti],followUps:(arr[ti].followUps||[]).filter((_,i)=>i!==fi)};
                      return {...p,transactions:arr};
                    })}
                  />
                  </>
                </div>
              ))}
            </div>
          </div>)} {/* end transactions tab */}

          </div>)} {/* end Tasks tab */}

          {/* General Notes — always visible in footer area */}
          {activeTab === "info" && (<>
          <SectionHeader>General Notes</SectionHeader>
          <textarea
            value={data.notes}
            onChange={e => set("notes", e.target.value)}
            rows={3}
            placeholder="Any additional notes..."
            style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
          </>)}

          </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 28px", borderTop: "1px solid #e2e8f0",
          display: "flex", justifyContent: "flex-end", gap: 10,
          background: "#f8fafc",
        }}>
          <button onClick={onClose} style={btnOutline}>Cancel</button>
          <SaveButton onSave={() => {
            // Flush any locally-typed "Other" carrier names into data before saving
            let finalData = { ...data };
            Object.entries(otherCarrierText).forEach(([catId, text]) => {
              const trimmed = text.trim();
              if (trimmed) {
                finalData = {
                  ...finalData,
                  benefitCarriers: {
                    ...(finalData.benefitCarriers || {}),
                    [catId + "__other_text"]: trimmed,
                    [catId]: trimmed,
                  },
                };
                // Add to carrier database if not already present
                if (onSaveCarrier && trimmed) {
                  onSaveCarrier(prev => {
                    const exists = prev.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
                    if (exists) return prev;
                    return [...prev, {
                      id: "c_" + Date.now() + "_" + catId,
                      name: trimmed,
                      type: "National",
                      category: catId.startsWith("medical") || catId === "medical" ? "Medical" : "Ancillary",
                      segments: [],
                      products: [],
                      funding: [],
                      states: [],
                      notes: "",
                      requirements: [],
                    }];
                  });
                }
              }
            });
            onSave(finalData);
          }} />
        </div>
      </div>
    </div>
  );
}

function CheckRow({ id, label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
      padding: "3px 0", fontSize: 12, color: checked ? "#1e40af" : "#64748b" }}>
      <input type="checkbox" checked={checked} onChange={onChange}
        style={{ accentColor: "#507c9c", width: 13, height: 13 }} />
      {label}
    </label>
  );
}

// ── Client Card ───────────────────────────────────────────────────────────────

function ClientCard({ client, onEdit, onDelete, tasksDb, currentUser }) {
  const canDelete = ["Team Lead","VP","Lead"].includes(currentUser?.role?.trim());
  const [expandedCat, setExpandedCat] = useState(null);
  const team = TEAMS[client.team];
  const badge = renewalBadge(client.renewalDate);
  const compPct = completionPct(client.compliance);
  const prePct = completionPct(client.preRenewal);
  const oePct = completionPct((client.openEnrollment || {}).tasks || {});

  // Build active categories from benefitActive flag
  const bc = client.benefitCarriers || {};
  const ba = client.benefitActive || {};
  const bed = client.benefitEffectiveDates || {};
  const activeCategories = BENEFITS_SCHEMA.map(cat => {
    const leaves = cat.children.length > 0 ? cat.children : [{ id: cat.id, label: cat.label }];
    const activePlans = leaves.filter(l => (client.benefits || {})[l.id]).map(l => l.label);
    const carrier = bc[cat.id] || null;
    const effectiveDate = bed[cat.id] || null;
    // isActive: use benefitActive flag if present, otherwise fall back to legacy activePlans check
    const isActive = cat.id in ba ? !!ba[cat.id] : activePlans.length > 0;
    return { id: cat.id, label: cat.label, activePlans, carrier, effectiveDate, isActive };
  }).filter(c => c.isActive);

  // Legacy: also show old carriers array if nothing else set
  const legacyCarriers = (!activeCategories.length && client.carriers && client.carriers.length)
    ? client.carriers : [];

  return (
    <div style={{
      background: "#fff",
      border: `1.5px solid ${team.border}`,
      borderTop: `4px solid ${team.border}`,
      borderRadius: 14,
      padding: 20,
      display: "flex", flexDirection: "column", gap: 14,
      boxShadow: "0 2px 12px rgba(0,0,0,.06)",
      transition: "box-shadow .2s",
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 24px rgba(0,0,0,.12)"}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,.06)"}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a",
              fontFamily: "'Playfair Display',Georgia,serif", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis" }}>
              {client.name || "Unnamed Client"}
            </div>
            {client.lead && (
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "2px 8px",
                borderRadius: 6, background: "#f0f5fa", color: "#4338ca",
                border: "1.5px solid #c7d2fe", letterSpacing: ".3px",
              }}>{client.lead}</span>
            )}
            {(() => {
              const s = client.clientStatus || "Active";
              const styles = {
                Active:     { bg: "#dcfce7", color: "#166534", border: "#86efac" },
                Terminated: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
                Transferred:{ bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
              };
              const st = styles[s] || styles.Active;
              return (
                <span style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "2px 8px",
                  borderRadius: 6, background: st.bg, color: st.color,
                  border: `1.5px solid ${st.border}`, letterSpacing: ".3px",
                }}>{s}{client.clientStatusDate ? ` · ${client.clientStatusDate.slice(5,7)}/${client.clientStatusDate.slice(8,10)}/${client.clientStatusDate.slice(0,4)}` : ""}</span>
              );
            })()}
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {formatDate(client.renewalDate)}
            {badge && <> &nbsp;<Badge {...badge} /></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={() => onEdit(client)} style={{
            background: "#f1f5f9", border: "none", borderRadius: 7, padding: "5px 10px",
            fontSize: 12, color: "#475569", cursor: "pointer", fontWeight: 600,
          }}>Edit</button>
          {canDelete && (
            <button onClick={() => onDelete(client.id)} style={{
              background: "#fee2e2", border: "none", borderRadius: 7, padding: "5px 10px",
              fontSize: 12, color: "#991b1b", cursor: "pointer", fontWeight: 600,
            }}>✕</button>
          )}
        </div>
      </div>

      {/* Badges row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: team.color, color: team.text,
        }}>Team {team.label}</span>
        <span style={{
          padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: "#f1f5f9", color: "#475569",
        }}>{client.marketSize}</span>
        <span style={{
          padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: "#f1f5f9", color: "#475569",
        }}>{client.fundingMethod}</span>
        {(client.continuation || []).includes("cobra") && (
          <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: "#fef3c7", color: "#92400e" }}>COBRA</span>
        )}
        {(client.continuation || []).includes("state_cont") && (
          <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: "#fef3c7", color: "#92400e" }}>State Cont.</span>
        )}

      </div>

      {/* Renewal received — Mid-Market only, within 90 days */}
      {["Mid-Market", "Large"].includes(client.marketSize) && (
        (client.renewalReceived || {}).received || (daysUntil(client.renewalDate) !== null && daysUntil(client.renewalDate) <= 90)
      ) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "7px 12px", borderRadius: 9,
          background: (client.renewalReceived || {}).received ? "#f0fdf4" : "#fef9c3",
          border: `1px solid ${(client.renewalReceived || {}).received ? "#86efac" : "#fde68a"}`,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800,
            color: (client.renewalReceived || {}).received ? "#166534" : "#854d0e" }}>
            {(client.renewalReceived || {}).received ? "✓ Renewal Received" : "⏳ Awaiting Renewal"}
          </span>
          {(client.renewalReceived || {}).date && (
            <span style={{ fontSize: 11, color: "#64748b" }}>
              {(client.renewalReceived || {}).date.slice(5,7)}/{(client.renewalReceived || {}).date.slice(8,10)}/{(client.renewalReceived || {}).date.slice(0,4)}
            </span>
          )}
          {(client.renewalReceived || {}).pct && (
            <span style={{
              fontSize: 12, fontWeight: 800, marginLeft: "auto",
              color: Number((client.renewalReceived || {}).pct) > 10 ? "#991b1b" : "#166534",
              background: Number((client.renewalReceived || {}).pct) > 10 ? "#fee2e2" : "#dcfce7",
              padding: "1px 8px", borderRadius: 99,
            }}>
              {(client.renewalReceived || {}).pct}%
            </span>
          )}
        </div>
      )}

      {/* Enrollment row */}
      {(client.totalEligible || (client.benefitEnrolled || {}).medical) && (
        <div style={{
          display: "flex", gap: 10,
          background: "#f8fafc", borderRadius: 10, padding: "8px 12px",
          border: "1px solid #e2e8f0",
        }}>
          {client.totalEligible && (
            <div style={{ flex: 1, textAlign: "center", borderRight: (client.benefitEnrolled || {}).medical ? "1px solid #e2e8f0" : "none", paddingRight: (client.benefitEnrolled || {}).medical ? 10 : 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
                {Number(client.totalEligible).toLocaleString()}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".8px", textTransform: "uppercase", marginTop: 2 }}>
                Total Eligible
              </div>
            </div>
          )}
          {(client.benefitEnrolled || {}).medical && (
            <div style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#3e5878", lineHeight: 1 }}>
                {Number((client.benefitEnrolled || {}).medical).toLocaleString()}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".8px", textTransform: "uppercase", marginTop: 2 }}>
                Enrolled in Medical
              </div>
            </div>
          )}
        </div>
      )}

      {/* Benefits with carriers — one row per category */}
      {activeCategories.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {activeCategories.map((cat, i) => (
            <div key={cat.id} style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", gap: 8, padding: "4px 0",
              borderBottom: i < activeCategories.length - 1 ? "1px dashed #f1f5f9" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: "#334155", fontWeight: 700 }}>{cat.label}</span>
                {cat.activePlans.length > 0 && cat.activePlans[0] !== "Active" && (
                  <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>
                    {cat.activePlans.join(", ")}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {cat.effectiveDate && (
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    {cat.effectiveDate.slice(5,7)}/{cat.effectiveDate.slice(8,10)}/{cat.effectiveDate.slice(0,4)}
                  </span>
                )}
                {cat.carrier
                  ? <span style={{ fontSize: 11, fontWeight: 700, color: "#3e5878",
                      background: "#dce8f2", padding: "1px 8px", borderRadius: 99 }}>
                      {cat.carrier}
                    </span>
                  : <span style={{ fontSize: 11, color: "#cbd5e1", fontStyle: "italic" }}>
                      No carrier
                    </span>
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legacy carrier display for clients not yet updated */}
      {legacyCarriers.length > 0 && (
        <div style={{ fontSize: 12, color: "#475569" }}>
          <span style={{ fontWeight: 700 }}>Carriers: </span>
          {legacyCarriers.join(", ")}
        </div>
      )}

      {/* Task category tiles — clickable, expand to show individual tasks */}
      {(() => {
        const oe = client.openEnrollment || {};
        const activeOETasks = OE_MATERIAL_TASKS.filter(t =>
          (t.material === "eguide"      && (oe.materials || {}).eguide) ||
          (t.material === "paper"       && (oe.materials || {}).paper)  ||
          (t.material === "memo"        && (oe.materials || {}).memo)   ||
          (t.material === "si_en"       && oe.enrollMethod === "si_en") ||
          (t.material === "si_ub"       && oe.enrollMethod === "si_ub") ||
          (t.material === "form"        && oe.enrollMethod === "form")  ||
          (t.material === "translation" && oe.translationNeeded)
        );
        const miscTasks   = client.miscTasks   || [];
        const postOETasks = client.postOETasks  || [];
        const ongoingTasks= client.ongoingTasks || {};

        // Category display order: Pre-Renewal, Renewal, OE, Post-OE, Compliance, Misc, Ongoing
        const categories = [
          // 1. Pre-Renewal
          {
            id: "preRenewal", label: "Pre-Renewal",
            tasks: PRERENEWAL_TASKS.filter(t => !t.acaOnly || client.marketSize === "ACA").map(t => ({
              label: getLabelForTask(t.id, tasksDb, t.label),
              status: getTaskStatus((client.preRenewal || {})[t.id]),
              dueDate: (typeof (client.preRenewal || {})[t.id] === "object" ? (client.preRenewal || {})[t.id]?.dueDate : "") || "",
            })),
          },
          // 2. Renewal
          ...(() => {
            const rm = client.renewalMeeting;
            const rmTask = (rm && typeof rm === "object") ? [{ label: "Schedule Renewal Meeting", status: rm.status || "Not Started", dueDate: rm.dueDate || "" }] : [];
            const autoTasks = Object.entries(client.renewalTasksAuto || {}).map(([k, t]) => ({
              label: t.title || (
                k.startsWith("bps_") ? "Prepare and Submit BPS — " + k.replace("bps_","") :
                k.startsWith("pcr_") ? "Submit Plan Change Request — " + k.replace("pcr_","") :
                k.startsWith("ncp_") ? "New Carrier Paperwork — " + k.replace("ncp_","") :
                k.startsWith("tl_")  ? "Termination Letter — " + k.replace("tl_","") :
                k === "bpa_medical"   ? "Prepare and Submit BPA — Medical" : k
              ),
              status: t.status || "Not Started", dueDate: t.dueDate || "",
            }));
            const manualTasks = (client.renewalTasks || []).map(t => ({ label: t.title || "Unnamed", status: t.status || "Not Started", dueDate: t.dueDate || "" }));
            const all = [...rmTask, ...autoTasks, ...manualTasks];
            return all.length ? [{ id: "renewal", label: "Renewal", tasks: all }] : [];
          })(),
          // 3. Open Enrollment
          ...(activeOETasks.length ? [{
            id: "oe", label: "Open Enrollment",
            tasks: activeOETasks.map(t => ({
              label: getLabelForTask(t.id, tasksDb, t.label),
              status: getTaskStatus((oe.tasks || {})[t.id]),
              dueDate: (typeof (oe.tasks || {})[t.id] === "object" ? (oe.tasks || {})[t.id]?.dueDate : "") || "",
            })),
          }] : []),
          // 4. Post-OE
          ...(() => {
            const hasCC = Object.values(client.benefitDecision || {}).some(v => v === "change_carrier");
            const fixedDefs = [
              { id: "elections_received",   label: "Elections Received?" },
              { id: "oe_changes_processed", label: "OE Changes Processed?" },
              ...(hasCC ? [{ id: "new_carrier_census", label: "New Carrier Submission Census Created?" }] : []),
              { id: "carrier_bill_audited", label: "Carrier Bill Audited?" },
              { id: "lineup_updated",       label: "Lineup Updated?" },
              { id: "oe_wrapup_email",      label: "OE Wrap-Up Email Sent?" },
            ];
            const pof = client.postOEFixed || {};
            const all = [
              ...fixedDefs.map(d => ({ label: d.label, status: (pof[d.id] || {}).status || "Not Started", dueDate: (pof[d.id] || {}).dueDate || "" })),
              ...postOETasks.map(t => ({ label: t.title || "Unnamed", status: t.status || "Not Started", dueDate: t.dueDate || "" })),
            ];
            return [{ id: "postOE", label: "Post-OE", tasks: all }];
          })(),
          // 5. Compliance
          {
            id: "compliance", label: "Compliance",
            tasks: COMPLIANCE_TASKS
              .filter(t => !(t.id === "aca_filing" && isACAFilingExempt(client)))
              .map(t => ({
              label: getLabelForTask(t.id, tasksDb, t.label),
              status: getTaskStatus((client.compliance || {})[t.id]),
              dueDate: (typeof (client.compliance || {})[t.id] === "object" ? (client.compliance || {})[t.id]?.dueDate : "") || "",
            })),
          },
          // 6. Ongoing
          ...(() => {
            const medCarrierC  = (client.benefitCarriers || {}).medical || (client.carriers || [])[0] || "";
            const medEnrolledC = Number((client.benefitEnrolled || {}).medical) || 0;
            const medPlansC    = (client.benefitPlans || {}).medical || [];
            const hasHMOC = medPlansC.some(p => p.type && p.type.toUpperCase().includes("HMO"));
            const hasPPOC = medPlansC.some(p => p.type && p.type.toUpperCase().includes("PPO"));
            const applicableOngoingC = (tasksDb || []).filter(t => {
              if (t.category !== "Ongoing") return false;
              if (t.markets && t.markets.length > 0 && !t.markets.includes(client.marketSize)) return false;
              if (t.carriers && t.carriers.length > 0 && !t.carriers.includes(medCarrierC)) return false;
              if (t.funding  && t.funding.length  > 0 && !t.funding.includes(client.fundingMethod)) return false;
              if (t.eligibilityRule === "blue_insights" && !(medEnrolledC >= 50 && (hasHMOC || hasPPOC))) return false;
              return true;
            });
            const extraOngoing = (ongoingTasks.__extra || []);
            const dbTasks = applicableOngoingC.map(def => {
              const stored = ongoingTasks[def.id] || {};
              return { label: def.label, status: stored.status || "Not Started", dueDate: stored.nextDue || "" };
            });
            const manualTasks = extraOngoing.map(t => ({ label: t.title || "Unnamed", status: t.status || "Not Started", dueDate: t.nextDue || "" }));
            const all = [...dbTasks, ...manualTasks];
            return all.length ? [{ id: "ongoing", label: "Ongoing", tasks: all }] : [];
          })(),
          // 7. Miscellaneous
          ...(miscTasks.length ? [{
            id: "misc", label: "Miscellaneous",
            tasks: miscTasks.map(t => ({ label: t.title || "Unnamed", status: t.status || "Not Started", dueDate: t.dueDate || "" })),
          }] : []),
        ].filter(cat => cat.tasks.length > 0);

        const statusColor = s => s === "Complete" ? "#166534" : s === "N/A" ? "#94a3b8" : s === "In Progress" ? "#92400e" : "#64748b";
        const statusBg    = s => s === "Complete" ? "#dcfce7" : s === "N/A" ? "#f1f5f9" : s === "In Progress" ? "#fef3c7" : "#f1f5f9";
        const statusDot   = s => s === "Complete" ? "#22c55e" : s === "N/A" ? "#cbd5e1" : s === "In Progress" ? "#f59e0b" : "#94a3b8";

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {categories.map(cat => {
              const total = cat.tasks.length;
              const done  = cat.tasks.filter(t => t.status === "Complete" || t.status === "N/A").length;
              const pct   = total ? Math.round((done / total) * 100) : 0;
              const hasOverdue = cat.tasks.some(t => t.dueDate && t.status !== "Complete" && t.status !== "N/A" && new Date(t.dueDate + "T12:00:00") < new Date());
              const isExpanded = expandedCat === cat.id;

              return (
                <div key={cat.id} style={{ borderRadius: 8, overflow: "hidden",
                  border: `1px solid ${isExpanded ? "#bfdbfe" : "#e2e8f0"}`,
                  background: isExpanded ? "#f8fbff" : "#f8fafc" }}>
                  {/* Tile header — clickable */}
                  <div onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                      cursor: "pointer", userSelect: "none" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b",
                      letterSpacing: ".8px", textTransform: "uppercase", flex: 1 }}>
                      {cat.label}
                    </span>
                    {hasOverdue && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px",
                        borderRadius: 99, background: "#fee2e2", color: "#991b1b" }}>⚠ OVERDUE</span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? "#166534" : "#475569" }}>
                      {done}/{total}
                    </span>
                    <div style={{ width: 48, height: 5, borderRadius: 99, background: "#e2e8f0", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99,
                        background: pct === 100 ? "#22c55e" : "#3b82f6", transition: "width .3s" }} />
                    </div>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded task list */}
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid #dbeafe", padding: "6px 10px 8px",
                      display: "flex", flexDirection: "column", gap: 4 }}>
                      {cat.tasks.map((t, i) => {
                        const overdue = t.dueDate && t.status !== "Complete" && t.status !== "N/A"
                          && new Date(t.dueDate + "T12:00:00") < new Date();
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                              background: statusDot(t.status) }} />
                            <span style={{ flex: 1, fontSize: 11, color: "#334155",
                              textDecoration: t.status === "N/A" ? "line-through" : "none",
                              opacity: t.status === "N/A" ? 0.5 : 1 }}>
                              {t.label}
                            </span>
                            {t.dueDate && (
                              <span style={{ fontSize: 9, fontWeight: 600, flexShrink: 0,
                                color: overdue ? "#e11d48" : "#94a3b8" }}>
                                {overdue ? "⚠ " : ""}{t.dueDate.slice(5,7)}/{t.dueDate.slice(8,10)}
                              </span>
                            )}
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px",
                              borderRadius: 99, flexShrink: 0,
                              background: statusBg(t.status), color: statusColor(t.status) }}>
                              {t.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Upcoming task due dates */}
      {(() => {
        const today = new Date();
        const oeTaskList = OE_MATERIAL_TASKS.filter(t => {
          const oe = client.openEnrollment || {};
          if (t.material === "eguide") return !!(oe.materials || {}).eguide;
          if (t.material === "paper")  return !!(oe.materials || {}).paper;
          if (t.material === "memo")   return !!(oe.materials || {}).memo;
          if (t.material === "si_en")  return oe.enrollMethod === "si_en";
          if (t.material === "si_ub")  return oe.enrollMethod === "si_ub";
          if (t.material === "translation") return !!oe.translationNeeded;
          return false;
        });
        const upcoming = [...PRERENEWAL_TASKS, ...oeTaskList, ...COMPLIANCE_TASKS].map(t => {
          const isOE = oeTaskList.find(x => x.id === t.id);
          const grp = COMPLIANCE_TASKS.find(x => x.id === t.id) ? "compliance" : isOE ? "oe_tasks" : "preRenewal";
          const task = grp === "oe_tasks"
            ? (client.openEnrollment?.tasks?.[t.id])
            : client[grp]?.[t.id];
          const status = getTaskStatus(task);
          const dueDate = typeof task === "object" ? task?.dueDate : "";
          const assignee = typeof task === "object" ? task?.assignee : "";
          if (!dueDate || status === "Complete" || status === "N/A") return null;
          const daysLeft = Math.ceil((new Date(dueDate) - today) / 86400000);
          if (daysLeft > 60 || daysLeft < 0) return null;
          return { label: getLabelForTask(t.id, tasksDb, t.label), dueDate, daysLeft, assignee, status };
        }).filter(Boolean).sort((a,b) => a.daysLeft - b.daysLeft);

        if (!upcoming.length) return null;
        return (
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: "1px",
              textTransform: "uppercase", marginBottom: 6 }}>Due Soon</div>
            {upcoming.map((u, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "3px 0", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#475569", flex: 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.label}</span>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                  {u.assignee && <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{u.assignee}</span>}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                    background: u.daysLeft <= 14 ? "#fee2e2" : "#fef3c7",
                    color: u.daysLeft <= 14 ? "#991b1b" : "#92400e",
                  }}>{u.daysLeft}d</span>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}


// ── Spreadsheet Import Parser ─────────────────────────────────────────────────
// Reads a filled-in General Information xlsx and maps cells to client fields.
// The spreadsheet uses a label → value pattern: col B has labels, col C has values,
// col D has right-side labels, col E has right-side values (0-indexed: 1,2,3).

function parseClientSpreadsheet(rows, tasksDb) {
  // Helper: get value in column index from a row index
  function val(rowIdx, colIdx) {
    const row = rows[rowIdx];
    if (!row) return "";
    const v = row[colIdx];
    if (v === undefined || v === null) return "";
    const s = String(v).trim();
    return s === "nan" || s === "None" ? "" : s;
  }

  // General info (rows 4-18, values in col 2 left-side, col 3 right-side)
  const client = newClient(tasksDb);
  client.id = Date.now();
  client.name            = val(4, 2);
  client.streetAddress   = val(5, 2);
  client.city            = val(6, 2);
  client.state           = val(7, 2);
  client.zipCode         = val(8, 2);
  client.mainPhone       = val(9, 2);
  client.taxId           = val(10, 2);
  client.sic             = val(11, 2);
  client.natureOfBusiness= val(12, 2);
  client.affiliatedEmployers = val(13, 2);
  client.groupSitus      = val(14, 2);
  client.contactName     = val(15, 2);
  client.contactTitle    = val(16, 2);
  client.contactEmail    = val(17, 2);
  client.contactPhone    = val(18, 2);
  // Right-side general info
  client.benefitAdminSystem = val(4, 3);
  client.ediEstablished     = val(5, 3);
  client.payrollSystem      = val(6, 3);
  client.payrollFrequency   = val(7, 3);
  client.cobraVendor        = val(8, 3);
  client.addlContactName    = val(15, 3);
  client.addlContactTitle   = val(16, 3);
  client.addlContactEmail   = val(17, 3);
  client.addlContactPhone   = val(18, 3);

  // Benefit sections — each block has a section header in col 0
  // and label/value pairs in cols 1/2 and 3/4
  const BENEFIT_BLOCKS = [
    { label: "MEDICAL",          catId: "medical",              startRow: 20 },
    { label: "DENTAL",           catId: "dental",               startRow: 29 },
    { label: "VISION",           catId: "vision",               startRow: 38 },
    { label: "BASE LIFE/AD&D",   catId: "basic_life",           startRow: 47 },
    { label: "VOL LIFE",         catId: "vol_life",             startRow: 58 },
    { label: "STD",              catId: "std",                  startRow: 71 },
    { label: "LTD",              catId: "ltd",                  startRow: 82 },
    { label: "NYDBL & PFL",      catId: "nydbl_pfl",            startRow: 93 },
    { label: "ACCIDENT",         catId: "worksite_accident",    startRow: 102 },
    { label: "CANCER",           catId: "worksite_cancer",      startRow: 114 },
    { label: "CRITICAL ILLNESS", catId: "worksite_ci",          startRow: 126 },
    { label: "HOSPITAL INDEMNITY", catId: "worksite_hospital",  startRow: 138 },
    { label: "EAP",              catId: "eap",                  startRow: 150 },
    { label: "TELEHEALTH",       catId: "telehealth",           startRow: 159 },
    { label: "IDENTITY THEFT",   catId: "identity_theft",       startRow: 168 },
    { label: "PREPAID LEGAL:",   catId: "prepaid_legal",        startRow: 177 },
    { label: "PET INSURANCE",    catId: "pet_insurance",        startRow: 186 },
    { label: "FSA",              catId: "fsa",                  startRow: 195 },
    { label: "COMMUTER",         catId: "commuter",             startRow: 204 },
    { label: "HSA",              catId: "hsa_funding",          startRow: 213 },
    { label: "HRA",              catId: "hra",                  startRow: 222 },
  ];

  // For each benefit block, read carrier from col 2 of the header row.
  // Only mark benefit active if carrier is filled in.
  BENEFIT_BLOCKS.forEach(({ catId, startRow }) => {
    const carrier       = val(startRow, 2);
    const policyNum     = val(startRow + 1, 2);
    const carrierContact= val(startRow + 1, 3);
    const hoursWeek     = val(startRow + 2, 2);
    const depAgeOff     = val(startRow + 2, 3);
    const waitingPeriod = val(startRow + 4, 2);
    const effDate       = val(startRow + 5, 2);
    const termDate      = val(startRow + 6, 2);
    const domPartner    = val(startRow + 3, 3);
    const retiree       = val(startRow + 4, 3);
    const carrierEdi    = val(startRow + 5, 3);
    // Notes/commission in last rows of section
    const notesRow = Object.entries({
      medical: 7, dental: 7, vision: 7, basic_life: 9,
      vol_life: 11, std: 9, ltd: 9, nydbl_pfl: 7,
      worksite_accident: 10, worksite_cancer: 10, worksite_ci: 10,
      worksite_hospital: 10, eap: 7, telehealth: 7, identity_theft: 7,
      prepaid_legal: 7, pet_insurance: 7, fsa: 7, commuter: 7,
      hsa_funding: 7, hra: 7,
    })[catId] || 7;
    const notes      = val(startRow + notesRow, 2);
    const commission = val(startRow + notesRow, 3);

    if (!carrier) return; // skip empty benefits

    client.benefitActive = { ...(client.benefitActive || {}), [catId]: true };
    client.benefitCarriers = { ...(client.benefitCarriers || {}), [catId]: carrier };
    if (policyNum) {
      client.benefitPolicyNumbers = { ...(client.benefitPolicyNumbers || {}), [catId]: [{ number: policyNum }] };
    }
    if (commission) {
      client.benefitCommissions = { ...(client.benefitCommissions || {}), [catId]: { type: "Flat %", amount: commission } };
    }

    const eligFields = {};
    if (carrierContact) eligFields.carrierContact = carrierContact;
    if (hoursWeek)      eligFields.hoursWeek = hoursWeek;
    if (depAgeOff)      eligFields.dependentAgeOff = depAgeOff;
    if (waitingPeriod)  eligFields.newHireWaitingPeriod = waitingPeriod;
    if (effDate)        eligFields.newHireEffDate = effDate;
    if (termDate)       eligFields.termDate = termDate;
    if (domPartner)     eligFields.domesticPartner = domPartner;
    if (retiree)        eligFields.retireeCoverage = retiree;
    if (carrierEdi)     eligFields.carrierEdi = carrierEdi;
    if (notes)          eligFields.specialNotes = notes;

    // Benefit-specific right-side fields
    if (catId === "basic_life" || catId === "vol_life") {
      const portability = val(startRow + 6, 3);
      const conversion  = val(startRow + 7, 3);
      if (portability) eligFields.portability = portability;
      if (conversion)  eligFields.conversion  = conversion;
      if (catId === "vol_life") {
        const adAndD      = val(startRow + 8, 3);
        const rateBased   = val(startRow + 9, 3);
        const ageBand     = val(startRow + 10, 3);
        if (adAndD)    eligFields.adAndD    = adAndD;
        if (rateBased) eligFields.rateBased = rateBased;
        if (ageBand)   eligFields.ageBandChanges = ageBand;
      }
    }
    if (catId === "std" || catId === "ltd") {
      const volOrEmp  = val(startRow + 2, 3);
      const preTax    = val(startRow + 3, 3);
      const grossUp   = val(startRow + 4, 3);
      const portab    = val(startRow + 6, 3);
      const convers   = val(startRow + 7, 3);
      if (volOrEmp) eligFields.voluntaryOrEmployer = volOrEmp;
      if (preTax)   eligFields.deductionType = preTax;
      if (grossUp)  eligFields.grossUp = grossUp;
      if (portab)   eligFields.portability = portab;
      if (convers)  eligFields.conversion  = convers;
    }
    if (catId === "fsa") {
      const medFSA = val(startRow + 2, 3);
      const lpFSA  = val(startRow + 3, 3);
      const dcFSA  = val(startRow + 4, 3);
      if (medFSA) eligFields.medFSA = medFSA;
      if (lpFSA)  eligFields.lpFSA  = lpFSA;
      if (dcFSA)  eligFields.dcFSA  = dcFSA;
    }
    if (catId === "commuter") {
      const transit  = val(startRow + 2, 3);
      const parking  = val(startRow + 3, 3);
      if (transit)  eligFields.transitAvailable  = transit;
      if (parking)  eligFields.parkingAvailable  = parking;
    }
    if (catId === "hsa_funding") {
      const preTax = val(startRow + 2, 3);
      if (preTax) eligFields.employerPreTax = preTax;
    }
    if (catId === "eap") {
      const standAlone = val(startRow + 2, 3);
      if (standAlone) eligFields.standAlone = standAlone;
    }

    if (Object.keys(eligFields).length > 0) {
      client.benefitEligibility = {
        ...(client.benefitEligibility || {}),
        [catId]: { ...((client.benefitEligibility || {})[catId] || {}), ...eligFields },
      };
    }
  });

  return client;
}


// ── Meetings View ─────────────────────────────────────────────────────────────

function MeetingsView({ meetings, onSave, clients, teams, onUpdateClient, tasksDb, onOpenClient, currentUser, userTeamId, userTeams }) {
  const isAC = currentUser?.role?.trim() === "Account Coordinator";
  const isMultiTeam = (userTeams || []).length > 1;
  const isRestricted = currentUser && !["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && (userTeams || []).length > 0;
  const canRecord = !isAC; // ACs can view but not record/edit meetings
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [filterTeam, setFilterTeam] = useState(isRestricted && !isMultiTeam ? (userTeamId || "All") : "All");
  const [expandedId, setExpandedId] = useState(null);
  const [notifyState, setNotifyState] = useState({}); // { memberId: "sent"|"composing" }

  const emptyForm = () => ({
    id: "mtg_" + Date.now(),
    date: new Date().toISOString().split("T")[0],
    team: "",
    attendees: [],
    notes: "",
    taskReviews: [],  // [{ clientId, taskGroup, taskId, arrayIndex, label, oldDue, newDue, newStatus, notes }]
    createdAt: new Date().toISOString(),
  });
  const [form, setForm] = useState(emptyForm);

  // Collect all open tasks for the selected team's clients
  const teamClients = clients.filter(c => {
    if (isRestricted && !(userTeams || []).includes(c.team)) return false;
    if (form.team && c.team !== form.team) return false;
    return true;
  });

  const allOpenTasks = teamClients.flatMap(c => {
    const days = daysUntil(c.renewalDate);
    const within120 = days !== null && days >= 0 && days <= 120;
    const tasks = collectOpenTasks(c, null, tasksDb);
    // Include all tasks for clients renewing within 120 days,
    // plus misc/post-OE tasks for any client regardless of renewal date
    const filtered = tasks.filter(t =>
      within120 || t.group === "miscTasks" || t.group === "postOETasks" || t.group === "renewalTasks" || t.group === "renewalMeeting" || t.group === "renewalTasksAuto"
    );
    return filtered.map(t => ({ ...t, clientId: c.id, clientName: c.name, _daysToRenewal: days }));
  });

  function saveForm() {
    if (!form.date) return;
    // Apply any due date / status changes back to clients
    const byClient = {};
    form.taskReviews.forEach(r => {
      if (!byClient[r.clientId]) byClient[r.clientId] = [];
      byClient[r.clientId].push(r);
    });
    Object.entries(byClient).forEach(([clientId, reviews]) => {
      const client = clients.find(c => String(c.id) === String(clientId));
      if (!client) return;
      let updated = JSON.parse(JSON.stringify(client));
      reviews.forEach(r => {
        const fields = {};
        if (r.newDue)    fields.dueDate = r.newDue;
        if (r.newStatus) fields.status  = r.newStatus;
        if (r.reviewNotes) fields.meetingNotes = r.reviewNotes;
        // Track due date history
        if (r.newDue && r.newDue !== r.oldDue && r.oldDue) {
          fields._dueDateHistory = [
            ...((getTaskObj(updated, r) || {})._dueDateHistory || []),
            { changedAt: form.date, originalDue: r.oldDue, newDue: r.newDue, meeting: form.id },
          ];
        }
        applyTaskFields(updated, r, fields);
      });
      onUpdateClient(updated);
    });

    const final = { ...form, updatedAt: new Date().toISOString() };
    onSave(prev => {
      const exists = prev.find(m => m.id === final.id);
      return exists ? prev.map(m => m.id === final.id ? final : m) : [final, ...prev];
    });
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  }

  function getTaskObj(clientData, r) {
    if (r.group === "compliance" || r.group === "preRenewal") return (clientData[r.group] || {})[r.taskId];
    if (r.group === "openEnrollment") return (clientData.openEnrollment?.tasks || {})[r.taskId];
    if (r.group === "miscTasks" || r.group === "postOETasks" || r.group === "renewalTasks") return (clientData[r.group] || [])[r.arrayIndex];
    if (r.group === "renewalMeeting") return clientData.renewalMeeting;
    if (r.group === "renewalTasksAuto") return (clientData.renewalTasksAuto || {})[r.taskId];
    if (r.group === "ongoingTasks") return (clientData.ongoingTasks || {})[r.taskId];
    return null;
  }

  function applyTaskFields(updated, r, fields) {
    if (r.group === "compliance" || r.group === "preRenewal") {
      const ex = updated[r.group]?.[r.taskId];
      const base = (typeof ex === "object" && ex) ? ex : { status: ex || "Not Started", assignee: "", dueDate: "", completedDate: "" };
      updated[r.group] = { ...updated[r.group], [r.taskId]: { ...base, ...fields } };
    } else if (r.group === "openEnrollment") {
      const ex = updated.openEnrollment?.tasks?.[r.taskId];
      const base = (typeof ex === "object" && ex) ? ex : { status: "Not Started", assignee: "", dueDate: "", completedDate: "" };
      updated.openEnrollment = { ...updated.openEnrollment, tasks: { ...(updated.openEnrollment?.tasks || {}), [r.taskId]: { ...base, ...fields } } };
    } else if (r.group === "miscTasks" || r.group === "postOETasks" || r.group === "renewalTasks") {
      const arr = [...(updated[r.group] || [])];
      arr[r.arrayIndex] = { ...arr[r.arrayIndex], ...fields };
      updated[r.group] = arr;
    } else if (r.group === "renewalMeeting") {
      updated.renewalMeeting = { ...(updated.renewalMeeting || {}), ...fields };
    } else if (r.group === "renewalTasksAuto") {
      updated.renewalTasksAuto = { ...(updated.renewalTasksAuto || {}), [r.taskId]: { ...(updated.renewalTasksAuto?.[r.taskId] || {}), ...fields } };
    } else if (r.group === "ongoingTasks") {
      updated.ongoingTasks = { ...(updated.ongoingTasks || {}), [r.taskId]: { ...(updated.ongoingTasks?.[r.taskId] || {}), ...fields } };
    }
  }

  function buildMailto(member, memberTasks, teamObj) {
    const email = memberTasks[0]?.memberEmail || "";
    if (!email) return null;
    const subject = `BenefitTrack Task Reminder - ${new Date().toLocaleDateString()}`;
    const lines = [`Hi ${member},`, "", "Here are your pending tasks:", ""];
    memberTasks.forEach(({ clientName, label, dueDate, status }) => {
      const due = dueDate ? ` - Due: ${formatDate(dueDate)}` : "";
      lines.push(`* ${clientName}: ${label}${due} [${status}]`);
    });
    lines.push("", "Please update task statuses in BenefitTrack as you complete them.", "", "Thank you!");
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  }

  // Group open tasks by assignee for notification
  function buildNotificationGroups(teamId) {
    const teamObj = teams.find(t => t.id === teamId);
    const tc = teamId ? clients.filter(c => c.team === teamId) : clients;
    const tasksByMember = {};
    tc.forEach(c => {
      collectOpenTasks(c, null, tasksDb).forEach(t => {
        const assignee = t.assignee || "Unassigned";
        if (!tasksByMember[assignee]) tasksByMember[assignee] = [];
        const memberInfo = teamObj?.members?.find(m => m.name === assignee || m.name.split(" ")[0] === assignee);
        tasksByMember[assignee].push({
          clientName: c.name, label: t.label, dueDate: t.dueDate,
          status: t.status, memberEmail: memberInfo?.email || "",
        });
      });
    });
    return tasksByMember;
  }

  const sorted = [...meetings]
    .filter(m => {
      if (isRestricted && !(userTeams || []).includes(m.team)) return false;
      if (filterTeam !== "All" && m.team !== filterTeam) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>Team Meetings</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{sorted.length} meeting{sorted.length !== 1 ? "s" : ""} recorded</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(!isRestricted || isMultiTeam) && (
            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
              style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px" }}>
              <option value="All">All Teams</option>
              {(isMultiTeam && isRestricted
                ? teams.filter(t => (userTeams || []).includes(t.id))
                : teams
              ).map(t => <option key={t.id} value={t.id}>Team {t.label}</option>)}
            </select>
          )}
          {canRecord && <button onClick={() => { setForm(emptyForm()); setShowForm(true); setEditId(null); }}
            style={btnPrimary}>+ New Meeting</button>}
        </div>
      </div>

      {/* New / Edit Meeting Form */}
      {showForm && (
        <div style={{ background: "#f8fafc", border: "1.5px solid #4a7fa5", borderRadius: 14,
          padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#2d4a6b", marginBottom: 16 }}>
            {editId ? "Edit Meeting" : "New Meeting Record"}
          </div>

          {/* Row 1: date + team + attendees */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, marginBottom: 12 }}>
            <label style={{ ...labelStyle, marginTop: 0 }}>
              Meeting Date
              <input type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>
            <label style={{ ...labelStyle, marginTop: 0 }}>
              Team
              <select value={form.team}
                onChange={e => setForm(p => ({ ...p, team: e.target.value, attendees: [], taskReviews: [] }))}
                style={{ ...inputStyle, marginTop: 3 }}>
                <option value="">— Select team —</option>
                {teams.map(t => <option key={t.id} value={t.id}>Team {t.label}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, marginTop: 0 }}>
              Attendees
              <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                {(teams.find(t => t.id === form.team)?.members || []).map(m => {
                  const checked = form.attendees.includes(m.name);
                  return (
                    <button key={m.name} type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        attendees: checked ? p.attendees.filter(a => a !== m.name) : [...p.attendees, m.name],
                      }))}
                      style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${checked ? "#4a7fa5" : "#e2e8f0"}`,
                        background: checked ? "#dce8f0" : "#fff",
                        color: checked ? "#2d4a6b" : "#64748b",
                        cursor: "pointer", fontFamily: "inherit" }}>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>

          {/* Meeting notes */}
          <label style={{ ...labelStyle, marginTop: 0, display: "block", marginBottom: 16 }}>
            Meeting Notes
            <textarea value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Key discussion points, decisions made, context..."
              rows={3}
              style={{ ...inputStyle, marginTop: 3, resize: "vertical", fontFamily: "inherit", fontSize: 12, width: "100%", boxSizing: "border-box" }} />
          </label>

          {/* Task Review section */}
          {form.team && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "1px",
                textTransform: "uppercase", marginBottom: 10 }}>Tasks Reviewed / Updated</div>
              {allOpenTasks.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No open tasks for this team.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Group by client, sorted by days to renewal */}
                  {Object.entries(
                    allOpenTasks.reduce((acc, t) => {
                      if (!acc[t.clientId]) acc[t.clientId] = { name: t.clientName, tasks: [], days: t._daysToRenewal };
                      acc[t.clientId].tasks.push(t);
                      return acc;
                    }, {})
                  ).sort(([, a], [, b]) => {
                    if (a.days === null) return 1;
                    if (b.days === null) return -1;
                    return a.days - b.days;
                  }).map(([clientId, { name, tasks, days }]) => (
                    <div key={clientId} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                      {/* Client header */}
                      <div style={{ background: "#f0f5fa", padding: "8px 14px",
                        borderRadius: "10px 10px 0 0", borderBottom: "1px solid #e2e8f0",
                        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#2d4a6b" }}>{name}</span>
                        {days !== null && days >= 0 && days <= 120 ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                            background: days <= 30 ? "#fee2e2" : days <= 60 ? "#fef3c7" : "#e8f0f7",
                            color: days <= 30 ? "#991b1b" : days <= 60 ? "#92400e" : "#2d4a6b" }}>
                            {days}d to renewal
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>Misc only</span>
                        )}
                      </div>

                      {/* Task rows */}
                      {tasks.map((t, ti) => {
                        const key = `${clientId}__${t.group}__${t.taskId || t.arrayIndex}__${ti}`;
                        const rev = form.taskReviews.find(r => r.key === key) || {};
                        const isReviewed = !!rev.key;
                        const slipped = isReviewed && rev.newDue && rev.oldDue && rev.newDue !== rev.oldDue;
                        return (
                          <div key={ti} style={{
                            borderBottom: ti < tasks.length - 1 ? "1px solid #f1f5f9" : "none",
                            background: isReviewed ? "#f0f9ff" : "transparent",
                          }}>
                            {/* Summary row — always visible */}
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                              <input type="checkbox" checked={isReviewed}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setForm(p => ({ ...p, taskReviews: [...p.taskReviews, {
                                      key, clientId, clientName: name,
                                      group: t.group, taskId: t.taskId, arrayIndex: t.arrayIndex,
                                      label: t.label, category: t.category,
                                      oldDue: t.dueDate || "", newDue: t.dueDate || "",
                                      newStatus: t.status || "Not Started", reviewNotes: "",
                                    }] }));
                                  } else {
                                    setForm(p => ({ ...p, taskReviews: p.taskReviews.filter(r => r.key !== key) }));
                                  }
                                }}
                                style={{ accentColor: "#4a7fa5", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a",
                                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {t.label}
                                </div>
                                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>{t.category}</div>
                              </div>
                              {t.assignee && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: "#e8f0f7",
                                  color: "#3e5878", padding: "2px 8px", borderRadius: 99, flexShrink: 0 }}>
                                  {t.assignee}
                                </span>
                              )}
                              {t.dueDate && (
                                <span style={{ fontSize: 10, fontWeight: 600, flexShrink: 0,
                                  color: new Date(t.dueDate + "T12:00:00") < new Date() ? "#dc2626" : "#64748b" }}>
                                  📅 {formatDate(t.dueDate)}
                                </span>
                              )}
                              {isReviewed && slipped && (
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e",
                                  background: "#fef3c7", padding: "2px 7px", borderRadius: 99, flexShrink: 0 }}>
                                  → {formatDate(rev.newDue)}
                                </span>
                              )}
                              {onOpenClient && (
                                <button type="button"
                                  onClick={e => { e.stopPropagation(); onOpenClient(clients.find(cl => String(cl.id) === String(clientId))); }}
                                  style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 6,
                                    border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8",
                                    cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}>
                                  Open Client →
                                </button>
                              )}
                            </div>

                            {/* Expanded review panel — 2×2 grid for readability */}
                            {isReviewed && (
                              <div style={{ padding: "0 14px 14px 40px",
                                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                {/* Row 1: Status + Notes */}
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                  display: "flex", flexDirection: "column", gap: 4 }}>
                                  Status
                                  <select value={rev.newStatus}
                                    onChange={e => setForm(p => ({ ...p, taskReviews: p.taskReviews.map(r =>
                                      r.key === key ? { ...r, newStatus: e.target.value,
                                        ...(e.target.value === "Complete" ? { completedDate: new Date().toISOString().split("T")[0] } : {})
                                      } : r
                                    )}))}
                                    style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                                    <option value="Not Started">Not Started</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Complete">Complete</option>
                                    <option value="N/A">N/A</option>
                                  </select>
                                </label>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                  display: "flex", flexDirection: "column", gap: 4 }}>
                                  Discussion Notes
                                  <input type="text" value={rev.reviewNotes || ""}
                                    onChange={e => setForm(p => ({ ...p, taskReviews: p.taskReviews.map(r =>
                                      r.key === key ? { ...r, reviewNotes: e.target.value } : r
                                    )}))}
                                    placeholder="What was discussed or decided..."
                                    style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
                                </label>
                                {/* Row 2: Original Due + New Due */}
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                  display: "flex", flexDirection: "column", gap: 4 }}>
                                  Original Due Date
                                  <input type="date" value={rev.oldDue} readOnly
                                    style={{ ...inputStyle, marginTop: 0, fontSize: 12,
                                      background: "#f8fafc", color: "#94a3b8" }} />
                                </label>
                                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569",
                                  display: "flex", flexDirection: "column", gap: 4 }}>
                                  Updated Due Date
                                  {slipped && (
                                    <span style={{ fontSize: 10, color: "#92400e", fontWeight: 600 }}>
                                      ⚠ Extended from {formatDate(rev.oldDue)}
                                    </span>
                                  )}
                                  <input type="date" value={rev.newDue}
                                    onChange={e => setForm(p => ({ ...p, taskReviews: p.taskReviews.map(r =>
                                      r.key === key ? { ...r, newDue: e.target.value } : r
                                    )}))}
                                    style={{ ...inputStyle, marginTop: 0, fontSize: 12,
                                      borderColor: slipped ? "#f59e0b" : undefined,
                                      background: slipped ? "#fffbeb" : undefined }} />
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={saveForm} style={{ ...btnPrimary, padding: "8px 24px" }}>
              Save Meeting Record
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null); }}
              style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Notification Panel */}
      {filterTeam !== "All" && (() => {
        const groups = buildNotificationGroups(filterTeam);
        const teamObj = teams.find(t => t.id === filterTeam);
        const membersWithEmail = Object.entries(groups).filter(([name]) => {
          const m = teamObj?.members?.find(x => x.name === name);
          return m?.email;
        });
        return (
          <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12,
            padding: "14px 18px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#166534" }}>🔔 Send Task Reminders — Team {teamObj?.label}</span>
              <span style={{ fontSize: 11, color: "#64748b" }}>Opens your email client with a pre-filled digest</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(groups).map(([member, tasks]) => {
                const memberInfo = teamObj?.members?.find(m => m.name === member || m.name.split(" ")[0] === member);
                const email = memberInfo?.email;
                const mailto = email ? buildMailto(member, tasks.map(t => ({ ...t, memberEmail: email })), teamObj) : null;
                const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate + "T12:00:00") < new Date()).length;
                return (
                  <div key={member} style={{ background: "#fff", border: "1px solid #bbf7d0",
                    borderRadius: 10, padding: "10px 14px", minWidth: 160 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#166534", marginBottom: 4 }}>{member}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                      {tasks.length} open task{tasks.length !== 1 ? "s" : ""}
                      {overdue > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}> · {overdue} overdue</span>}
                    </div>
                    {mailto ? (
                      <a href={mailto} style={{ display: "inline-block", padding: "4px 12px",
                        borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: "#166534", color: "#fff", textDecoration: "none" }}>
                        ✉ Send Reminder
                      </a>
                    ) : (
                      <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
                        No email on file
                      </div>
                    )}
                  </div>
                );
              })}
              {Object.keys(groups).length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No open tasks for this team.</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Meeting Records List */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 20px", background: "#fff",
          borderRadius: 14, border: "1.5px dashed #e2e8f0", color: "#94a3b8" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#64748b" }}>No meetings recorded yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Click "+ New Meeting" to log your first team meeting</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sorted.map(mtg => {
            const teamObj = teams.find(t => t.id === mtg.team);
            const isExpanded = expandedId === mtg.id;
            const slippedTasks = (mtg.taskReviews || []).filter(r => r.newDue && r.oldDue && r.newDue !== r.oldDue);
            const completedTasks = (mtg.taskReviews || []).filter(r => r.newStatus === "Complete");
            return (
              <div key={mtg.id} style={{ background: "#fff", borderRadius: 12,
                border: "1.5px solid #e2e8f0", overflow: "hidden" }}>
                {/* Header */}
                <div onClick={() => setExpandedId(isExpanded ? null : mtg.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
                    cursor: "pointer", userSelect: "none",
                    background: isExpanded ? "#f0f5fa" : "#fff",
                    borderBottom: isExpanded ? "1px solid #e2e8f0" : "none" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                      {fmtDate(mtg.date)}
                      {teamObj && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 700,
                        padding: "2px 8px", borderRadius: 99,
                        background: teamObj.color || "#f1f5f9",
                        color: teamObj.text || "#475569" }}>Team {teamObj.label}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {mtg.attendees?.length > 0 && <span>👥 {mtg.attendees.join(", ")}</span>}
                      <span>📝 {(mtg.taskReviews || []).length} tasks reviewed</span>
                      {completedTasks.length > 0 && <span style={{ color: "#166534" }}>✓ {completedTasks.length} completed</span>}
                      {slippedTasks.length > 0 && <span style={{ color: "#92400e" }}>⚠ {slippedTasks.length} date{slippedTasks.length > 1 ? "s" : ""} extended</span>}
                    </div>
                  </div>
                  {canRecord && <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={e => { e.stopPropagation(); setForm({ ...mtg }); setEditId(mtg.id); setShowForm(true); }}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569",
                        cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                    <button type="button" onClick={e => { e.stopPropagation(); if (confirm("Delete this meeting record?")) onSave(p => p.filter(m => m.id !== mtg.id)); }}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                        cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>}
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "16px 18px" }}>
                    {mtg.notes && (
                      <div style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px",
                        marginBottom: 14, fontSize: 13, color: "#334155", lineHeight: 1.6,
                        borderLeft: "3px solid #4a7fa5" }}>
                        {mtg.notes}
                      </div>
                    )}
                    {(mtg.taskReviews || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8",
                          letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Tasks Reviewed</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(mtg.taskReviews || []).map((r, ri) => {
                            const slipped = r.newDue && r.oldDue && r.newDue !== r.oldDue;
                            const completed = r.newStatus === "Complete";
                            return (
                              <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 10,
                                padding: "8px 12px", borderRadius: 8,
                                background: completed ? "#f0fdf4" : slipped ? "#fffbeb" : "#f8fafc",
                                border: `1px solid ${completed ? "#86efac" : slipped ? "#fde68a" : "#e2e8f0"}` }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span><span style={{ color: "#64748b", fontWeight: 600 }}>{r.clientName} · </span>{r.label}</span>
                                    {onOpenClient && (
                                      <button type="button"
                                        onClick={() => onOpenClient(clients.find(cl => String(cl.id) === String(r.clientId)))}
                                        style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 6,
                                          border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8",
                                          cursor: "pointer", fontFamily: "inherit" }}>
                                        Open Client →
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                                      background: completed ? "#dcfce7" : "#f1f5f9",
                                      color: completed ? "#166534" : "#475569" }}>{r.newStatus}</span>
                                    {r.oldDue && <span style={{ fontSize: 10, color: "#94a3b8" }}>Original: {formatDate(r.oldDue)}</span>}
                                    {slipped && <span style={{ fontSize: 10, color: "#92400e", fontWeight: 700 }}>→ Extended to {formatDate(r.newDue)}</span>}
                                    {!slipped && r.newDue && !completed && <span style={{ fontSize: 10, color: "#64748b" }}>Due: {formatDate(r.newDue)}</span>}
                                  </div>
                                  {r.reviewNotes && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, fontStyle: "italic" }}>{r.reviewNotes}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

const SAMPLE_CLIENTS = [{"id":1,"name":"Spring-Green","renewalDate":"2027-01-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Complete","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Complete","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":2,"name":"Felipe's","renewalDate":"2027-01-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":3,"name":"Chicago Flameproof","renewalDate":"2027-01-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"1) $100 extra to the dependent cost; 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":4,"name":"Tri-City","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"1) dependent cost: 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":5,"name":"Shred 415","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Not Started","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":6,"name":"J Jordan Inc.","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":7,"name":"RWE P&D","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":8,"name":"C A Larson (OWM)","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"1) 100%; 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":9,"name":"First Choice Dental Lab","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":10,"name":"VNA","renewalDate":"2027-01-01","marketSize":"Large","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Complete","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Complete","assignee":"","dueDate":"","completedDate":""}},"notes":"1) 100%; 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":11,"name":"Eyas Landing","renewalDate":"2027-01-01","marketSize":"Large","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Complete","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Complete","assignee":"","dueDate":"","completedDate":""}},"notes":"1) 100%; 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":12,"name":"Cyl-Tec","renewalDate":"2027-01-01","marketSize":"Mid-Market","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"1) 100%; 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":13,"name":"Rosary","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Not Started","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":14,"name":"Biologos","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Not Started","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":15,"name":"Share Machine","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Not Started","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":16,"name":"Village Bible Church","renewalDate":"2027-01-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":17,"name":"ICT/HTC","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":18,"name":"Collaborative Office Solutions","renewalDate":"2027-01-01","marketSize":"Large","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["Kaiser"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":19,"name":"Kaiperm","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["Kaiser"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":20,"name":"Aux, LLC (CU Network)","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Not Started","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":21,"name":"Plexcity","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":22,"name":"OCUL","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":23,"name":"CCUL","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":24,"name":"MDDC","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["CareFirst"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":25,"name":"CULCT","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":26,"name":"Humanidei (O'Rourke)","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":27,"name":"Hamilton Horizons","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":28,"name":"WCUNA","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":29,"name":"Mid-America (DACU)","renewalDate":"2027-01-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSND"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-07-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-10-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-01-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":30,"name":"Axis Design","renewalDate":"2027-02-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["Aetna"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2028-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2028-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2028-07-31","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-08-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-11-03","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-11-03","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-11-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-11-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-02-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":31,"name":"SERVA","renewalDate":"2027-03-01","marketSize":"Mid-Market","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["Cigna"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2028-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2028-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2026-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2028-07-31","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-09-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-12-01","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-12-01","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-12-01","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2027-03-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":32,"name":"NASCUS","renewalDate":"2026-04-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["CareFirst"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-10-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2025-12-31","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2025-12-31","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2025-12-31","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2025-12-31","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-04-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":33,"name":"TBJ Drywall","renewalDate":"2026-04-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-10-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2025-12-31","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2025-12-31","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2025-12-31","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"1) 100%; 2) add to OE","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-04-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":34,"name":"MAC Electrical","renewalDate":"2026-05-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-11-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-01-30","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-01-30","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-01-30","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-01-30","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-05-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":35,"name":"Marberry","renewalDate":"2026-05-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-11-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-01-30","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-01-30","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-01-30","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-05-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":36,"name":"Anesthesia Assoc.","renewalDate":"2026-06-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-12-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-03-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-06-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":37,"name":"Patroness (LUCI)","renewalDate":"2026-06-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSTN"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-12-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-03-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-06-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":38,"name":"Ivy League Kids","renewalDate":"2026-06-01","marketSize":"Mid-Market","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2026-12-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-03-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-06-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":39,"name":"RWE","renewalDate":"2026-07-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-01-29","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-04-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-07-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":40,"name":"RWE M&D","renewalDate":"2026-07-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-01-29","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-04-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-07-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":41,"name":"New Wave","renewalDate":"2026-07-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-01-29","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-04-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-04-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-07-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":42,"name":"NAFD","renewalDate":"2026-08-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-02-26","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-05-01","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-05-01","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-05-01","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-08-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":43,"name":"Crosby & Trahan","renewalDate":"2026-09-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-09-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":44,"name":"Hollywood Home","renewalDate":"2026-09-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BSC/Kaiser"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-09-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":45,"name":"OCS","renewalDate":"2026-09-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-09-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":46,"name":"NACUSO","renewalDate":"2026-09-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["Anthem of MI"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-06-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-09-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":47,"name":"HPC","renewalDate":"2026-10-01","marketSize":"Large","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UMR"],"fundingMethod":"Self-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Complete","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":48,"name":"CDP","renewalDate":"2026-10-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Complete","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Complete","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":49,"name":"Amer Surveying","renewalDate":"2026-10-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":50,"name":"ADT Corp","renewalDate":"2026-10-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":51,"name":"Carriere-Stumm","renewalDate":"2026-10-01","marketSize":"Mid-Market","team":"India","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":52,"name":"DuPage Precision","renewalDate":"2026-10-01","marketSize":"Mid-Market","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":53,"name":"GreatBanc","renewalDate":"2026-10-01","marketSize":"Mid-Market","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":54,"name":"Ferguson Roofing","renewalDate":"2026-10-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-04-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-07-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-07-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-10-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":55,"name":"J&R Herra","renewalDate":"2026-11-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-05-28","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-11-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":56,"name":"Walsh Long","renewalDate":"2026-11-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-05-28","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-11-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":57,"name":"DAE","renewalDate":"2026-11-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["Cigna"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"Complete","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-05-28","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-08-03","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-11-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":58,"name":"Nadler Golf","renewalDate":"2026-12-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-06-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-12-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":59,"name":"CIFII/Fontana","renewalDate":"2026-12-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-06-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-12-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":60,"name":"Moline Bearing","renewalDate":"2026-12-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Level-Funded","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"Not Started","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-06-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-12-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"},{"id":61,"name":"Honey Can Do","renewalDate":"2026-12-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Complete","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-06-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"bills_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"sbc_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-12-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":62,"name":"CUANM","renewalDate":"2026-12-01","marketSize":"ACA","team":"Juliet","benefits":{"medical_ppo":true},"carriers":["UHC"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-06-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-12-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":""},{"id":63,"name":"Synergy Builders","renewalDate":"2026-12-01","marketSize":"ACA","team":"India","benefits":{"medical_ppo":true},"carriers":["BCBSIL"],"fundingMethod":"Fully Insured","compliance":{"aca_filing":{"status":"Not Started","assignee":"","dueDate":"2027-03-31","completedDate":""},"rxdc":{"status":"Not Started","assignee":"","dueDate":"2027-06-01","completedDate":""},"medicare_d":{"status":"Not Started","assignee":"","dueDate":"2025-10-15","completedDate":""},"pcori":{"status":"N/A","assignee":"","dueDate":"2027-08-02","completedDate":""},"form5500":{"status":"Not Started","assignee":"","dueDate":"2027-06-30","completedDate":""}},"preRenewal":{"renewal_dl":{"status":"Complete","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"bills_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"sbc_dl":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""},"blue_insights":{"status":"Not Started","assignee":"","dueDate":"","completedDate":""},"data_sheet":{"status":"Not Started","assignee":"Kia","dueDate":"2026-09-02","completedDate":""}},"notes":"","benefitActive":{"medical":true},"benefitEffectiveDates":{"medical":"2026-12-01"},"benefitNotes":{},"openEnrollment":{"oeStartDate":"","oeEndDate":"","commType":"","oeType":"","materials":{},"enrollMethod":"","translationNeeded":false,"tasks":{}},"renewalReceived":{"received":false,"date":""},"rateRelief":{"requested":false,"requestedDate":"","received":false,"receivedDate":"","pct":""},"miscTasks":[],"lead":"RG","clientStatus":"Active","clientStatusDate":"","groupSitus":"Illinois"}];


const STATE_ABBREVS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
  "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

const STORAGE_KEY = "benefittrack_clients_v1";


function applyDataFixes(c) {
  const fixed = { ...c };

  // Default blank lead → RG
  if (!fixed.lead) fixed.lead = "RG";
  // Default blank clientStatus → Active
  if (!fixed.clientStatus) fixed.clientStatus = "Active";

  // Ensure renewalMeeting exists (added later — may be missing on older records)
  if (!fixed.renewalMeeting) {
    fixed.renewalMeeting = { status: "Not Started", assignee: "", dueDate: "", completedDate: "", notes: "", meetingType: "", virtualPlatform: "", meetingDate: "", meetingTime: "" };
  }
  // Ensure task arrays exist
  if (!fixed.renewalTasks)   fixed.renewalTasks   = [];
  if (!fixed.renewalTasksAuto) fixed.renewalTasksAuto = {};
  if (!fixed.postOETasks)    fixed.postOETasks     = [];
  if (!fixed.postOEFixed)    fixed.postOEFixed      = {};
  if (!fixed.miscTasks)      fixed.miscTasks       = [];
  // Ensure new fields from recent updates exist on older records
  if (!fixed.transactions)   fixed.transactions    = [];
  if (!fixed.benefitRates)   fixed.benefitRates    = {};
  if (!fixed.ancillaryRenewalReceived) fixed.ancillaryRenewalReceived = {};
  if (!fixed.benefits)       fixed.benefits        = {};
  // Ensure miscTasks entries have followUps array (older entries won't have it)
  if (Array.isArray(fixed.miscTasks)) {
    fixed.miscTasks = fixed.miscTasks.map(t =>
      t.followUps ? t : { ...t, followUps: [] }
    );
  }
  if (fixed.clientStatusDate === undefined) fixed.clientStatusDate = "";
  // Auto-assign Illinois situs for BCBSIL medical carrier
  if (!fixed.groupSitus) {
    const carriers = fixed.carriers || [];
    const medCarrier = (fixed.benefitCarriers || {}).medical || "";
    const hasBCBSIL = carriers.includes("BCBSIL") || medCarrier === "BCBSIL";
    fixed.groupSitus = hasBCBSIL ? "Illinois" : "";
  }

  // COBRA for any client with medicalEnrolled >= 20
  try {
    const enrolled = Number(fixed.medicalEnrolled);
    if (!isNaN(enrolled) && enrolled >= 20) {
      const cont = Array.isArray(fixed.continuation) ? fixed.continuation : [];
      if (!cont.includes("cobra")) fixed.continuation = [...cont, "cobra"];
    }
  } catch(e) {}

  const comp = { ...(fixed.compliance || {}) };

  // ACA Filing → N/A for small employer + Fully Insured groups
  if (isACAFilingExempt(fixed)) {
    if (comp.aca_filing && typeof comp.aca_filing === "object" && comp.aca_filing.status !== "N/A") {
      comp.aca_filing = { ...comp.aca_filing, status: "N/A" };
    }
  }

  // PCORI → N/A for Fully Insured groups
  if (fixed.fundingMethod === "Fully Insured") {
    if (comp.pcori && typeof comp.pcori === "object" && comp.pcori.status !== "N/A") {
      comp.pcori = { ...comp.pcori, status: "N/A" };
    }
  }

  // 5500 → N/A if no benefit has 100+ enrolled; restore to Not Started if any does
  try {
    const enrolledMap = fixed.benefitEnrolled || {};
    const anyOver100 = Object.values(enrolledMap).some(v => Number(v) >= 100);
    if (comp.form5500 && typeof comp.form5500 === "object") {
      if (!anyOver100 && comp.form5500.status !== "N/A") {
        comp.form5500 = { ...comp.form5500, status: "N/A" };
      } else if (anyOver100 && comp.form5500.status === "N/A") {
        comp.form5500 = { ...comp.form5500, status: "Not Started" };
      }
    }
  } catch(e) {}

  fixed.compliance = comp;

  // Medicare Part D: recalculate due date if stored date is in the past
  // (Oct 15 before the plan year starts — should always be in the future or current year)
  try {
    const medD = fixed.compliance?.medicare_d;
    if (medD && typeof medD === "object" && medD.status !== "N/A" && fixed.renewalDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const storedDate = medD.dueDate ? new Date(medD.dueDate + "T12:00:00") : null;
      if (storedDate && storedDate < today) {
        // Recalculate: Oct 15 of the year before renewal
        const [ry] = fixed.renewalDate.split("-").map(Number);
        const correctDate = prevBizDay(`${ry - 1}-10-15`);
        const correctD = new Date(correctDate + "T12:00:00");
        // If the recalculated date is also past, advance to next Oct 15
        const finalDate = correctD < today
          ? prevBizDay(`${ry}-10-15`)
          : correctDate;
        fixed.compliance = {
          ...fixed.compliance,
          medicare_d: { ...medD, dueDate: finalDate },
        };
      }
    }
  } catch(e) {}

  // ACA groups: auto-mark Fully Insured quote as N/A for Aetna and Cigna in Medical RFP
  try {
    if (fixed.marketSize === "ACA") {
      const rfpCarriers = (fixed.preRenewal?.med_rfp?.rfpCarriers) || {};
      const updated = { ...rfpCarriers };
      let changed = false;
      ["Aetna", "Cigna"].forEach(carrier => {
        if (updated[carrier] && updated[carrier].fi_na !== true) {
          updated[carrier] = { ...updated[carrier], fi_na: true };
          changed = true;
        }
      });
      if (changed && fixed.preRenewal?.med_rfp) {
        fixed.preRenewal = {
          ...fixed.preRenewal,
          med_rfp: { ...fixed.preRenewal.med_rfp, rfpCarriers: updated },
        };
      }
    }
  } catch(e) {}

  return applyPreRenewalRules(fixed);
}

// Merge saved data over the baseline — saved records win, new baseline records fill gaps
function loadClients_DEPRECATED() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return SAMPLE_CLIENTS.map(applyDataFixes);
    const savedList = JSON.parse(saved);
    // Build a map of saved clients by id
    const savedById = {};
    savedList.forEach(c => { savedById[c.id] = c; });
    // Start from SAMPLE_CLIENTS so new clients added in code updates appear,
    // but override any record that the user has saved edits for
    const merged = SAMPLE_CLIENTS.map(c => savedById[c.id] ? savedById[c.id] : c);
    // Also include any clients the user added manually (ids not in SAMPLE_CLIENTS)
    const baseIds = new Set(SAMPLE_CLIENTS.map(c => c.id));
    savedList.forEach(c => { if (!baseIds.has(c.id)) merged.push(c); });
    // Apply data fixes to every record and immediately persist the corrected list
    const fixed = merged.map(applyDataFixes);
    // Apply DDR rules on load so due dates are always fresh
    const ddr = loadDueDateRules();
    const tasks = loadTasksData();
    const withDDR = fixed.map(c => applyDueDateRulesToClient(c, tasks, ddr));
    persistClients(withDDR);
    return withDDR;
  } catch(e) {
    return SAMPLE_CLIENTS.map(applyDataFixes);
  }
}

function persistClients_DEPRECATED(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}


// ── Carrier Products Database ────────────────────────────────────────────────
const CARRIERS_STORAGE_KEY  = "benefittrack_carriers_v1";
const MEETINGS_STORAGE_KEY  = "benefittrack_meetings_v1";

function loadMeetings_DEPRECATED() {
  try {
    const saved = localStorage.getItem(MEETINGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch(e) { return []; }
}
function persistMeetings_DEPRECATED(list) {
  try { localStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}
const TASKS_STORAGE_KEY    = "benefittrack_tasks_v4";

// ── Default Task Database ────────────────────────────────────────────────────
const TASK_CATEGORIES_DB = ["Pre-Renewal", "Renewal", "Open Enrollment", "Post-OE", "Compliance", "Miscellaneous", "Ongoing", "Transactions"];

const RECURRENCE_OPTIONS = ["Monthly", "Quarterly", "Annually"];

// Due date rule anchors (events that rules are calculated relative to)
const DDR_ANCHORS = [
  { id: "renewal",           label: "Renewal Date" },
  { id: "renewal_receipt",   label: "Receipt of Renewal" },
  { id: "decision_receipt",  label: "Receipt of Decisions" },
  { id: "oe_start",          label: "OE Start Date" },
  { id: "oe_end",            label: "OE End Date" },
  { id: "plan_year_end",     label: "Plan Year End" },
  { id: "transaction_request", label: "Transaction Request Date" },
];

const DDR_STORAGE_KEY = "benefittrack_ddr_v1";

const DEFAULT_DUE_DATE_RULES = [
  { id: "renewal_minus_90", label: "90 days before renewal",   anchor: "renewal",  direction: "before", days: 90, builtin: true },
  { id: "renewal_minus_60", label: "60 days before renewal",   anchor: "renewal",  direction: "before", days: 60, builtin: true },
  { id: "renewal_minus_30", label: "30 days before renewal",   anchor: "renewal",  direction: "before", days: 30, builtin: true },
  { id: "aca",          label: "ACA: March 31 after plan year",              anchor: "plan_year_end", direction: "after", days: null, builtin: true },
  { id: "rxdc",         label: "RxDC: June 1 after plan year",               anchor: "plan_year_end", direction: "after", days: null, builtin: true },
  { id: "medicare",     label: "Medicare Part D: Oct 15 before plan year",   anchor: "renewal",       direction: "before", days: null, builtin: true },
  { id: "pcori",        label: "PCORI: July 31 after plan year",             anchor: "plan_year_end", direction: "after", days: null, builtin: true },
  { id: "form5500",     label: "5500: End of 7th month after plan year",     anchor: "plan_year_end", direction: "after", days: null, builtin: true },
  { id: "txn_plus_3",    label: "3 business days after transaction request",   anchor: "transaction_request", direction: "after", days: 3,    builtin: true },
];

function loadDueDateRules_DEPRECATED() {
  try {
    const saved = localStorage.getItem(DDR_STORAGE_KEY);
    if (!saved) return DEFAULT_DUE_DATE_RULES;
    const loaded = JSON.parse(saved);
    // Forward-compat: ensure all built-in rules are present
    const loadedIds = new Set(loaded.map(r => r.id));
    const missing = DEFAULT_DUE_DATE_RULES.filter(r => !loadedIds.has(r.id));
    return [...missing, ...loaded];
  } catch(e) { return DEFAULT_DUE_DATE_RULES; }
}
function persistDueDateRules_DEPRECATED(list) {
  try { localStorage.setItem(DDR_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}

// Kept for backward compat — callers that use DUE_DATE_RULES get DEFAULT list;
// live version is passed as prop dueDateRules
const DUE_DATE_RULES = DEFAULT_DUE_DATE_RULES;

const DEFAULT_TASKS_DATA = [
  // ── Compliance ──────────────────────────────────────────────────────────
  { id: "t_aca_filing",  label: "ACA Filing",                category: "Compliance",    markets: ["ACA","Mid-Market","Large"], defaultAssignee: "",    dueDateRule: "aca",      order: 10 },
  { id: "t_rxdc",        label: "RxDC Filing",               category: "Compliance",    markets: ["ACA","Mid-Market","Large"], defaultAssignee: "",    dueDateRule: "rxdc",     order: 20 },
  { id: "t_medicare_d",  label: "Medicare Part D Disclosure", category: "Compliance",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "",    dueDateRule: "medicare", order: 30 },
  { id: "t_pcori",       label: "PCORI Filing",              category: "Compliance",    markets: ["Mid-Market","Large"],      defaultAssignee: "",    dueDateRule: "pcori",    order: 40 },
  { id: "t_form5500",    label: "5500 Filing",               category: "Compliance",    markets: ["ACA","Mid-Market","Large"], defaultAssignee: "",    dueDateRule: "form5500", order: 50 },
  // ── Pre-Renewal ─────────────────────────────────────────────────────────
  { id: "t_renewal_dl",    label: "Renewal Download",         category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "renewal_minus_90", order: 10 },
  { id: "t_bills_dl",      label: "Bills Download",           category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "renewal_minus_90", order: 20 },
  { id: "t_sbc_dl",        label: "SBC Download",             category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "renewal_minus_90", order: 30 },
  { id: "t_blue_insights", label: "Blue Insights Download",   category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "renewal_minus_90", order: 40 },
  { id: "t_data_sheet",    label: "Data Sheet Preparation",   category: "Pre-Renewal",   markets: ["ACA"],                     defaultAssignee: "Account Coordinator", dueDateRule: "renewal_minus_90", order: 50 },
  { id: "t_census",        label: "Request/Download Census",  category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "renewal_minus_90", order: 60 },
  { id: "t_med_rfp",       label: "Prepare/Send Medical RFP", category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",    dueDateRule: "",         order: 70 },
  { id: "t_anc_rfp",       label: "Prepare/Send Ancillary RFP", category: "Pre-Renewal", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",   dueDateRule: "",         order: 80 },
  { id: "t_exhibits",      label: "Prepare Exhibits",         category: "Pre-Renewal",   markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",    dueDateRule: "",         order: 90 },
  // ── Open Enrollment ─────────────────────────────────────────────────────
  { id: "t_oet_eguide",     label: "Prepare E-Guide",         category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 10 },
  { id: "t_oet_paper",      label: "Prepare Paper Guide",     category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 20 },
  { id: "t_oet_memo",       label: "Prepare Memo",            category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 30 },
  { id: "t_oet_workbook_en",label: "Renewal Workbook (EN)",   category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 40 },
  { id: "t_oet_workbook_ub",label: "Plan Renewal (UB)",       category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 50 },
  { id: "t_oet_form",       label: "Prepare Enrollment Form", category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "", order: 60 },
  { id: "t_oet_translation",label: "Translation",             category: "Open Enrollment", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 70 },
  // ── Post-OE ─────────────────────────────────────────────────────────────
  { id: "t_post_submission", label: "Submit Enrollment",       category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 10 },
  { id: "t_post_id_cards",   label: "Confirm ID Cards Issued", category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 20 },
  { id: "t_post_billing",    label: "Verify First Bill",       category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 30 },
  // ── Ongoing ────────────────────────────────────────────────────────────────
  // ── Renewal ─────────────────────────────────────────────────────────────────
  { id: "t_schedule_meeting",      label: "Schedule Renewal Meeting",        category: "Renewal", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",    dueDateRule: "renewal_minus_90", order: 10 },
  { id: "t_renewal_analysis",      label: "Prepare Renewal Analysis",        category: "Renewal", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",    dueDateRule: "renewal_minus_60", order: 20 },
  { id: "t_present_renewal",       label: "Present Renewal to Client",       category: "Renewal", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Executive",  dueDateRule: "renewal_minus_30", order: 30 },
  { id: "t_renewal_decision",      label: "Obtain Renewal Decision",         category: "Renewal", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Executive",  dueDateRule: "renewal_minus_30", order: 40 },
  { id: "t_submit_enrollment",     label: "Submit Enrollment / Applications",category: "Renewal", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "",               order: 50 },
  { id: "t_update_contracts",      label: "Update Contracts / Agreements",   category: "Renewal", markets: ["Mid-Market","Large"],      defaultAssignee: "Account Manager",    dueDateRule: "",               order: 60 },

  // ── Post-OE (additional) ───────────────────────────────────────────────────
  { id: "t_elections_received",    label: "Elections Received?",                       category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "", order: 5 },
  { id: "t_oe_changes_processed",  label: "OE Changes Processed?",                    category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "", order: 6 },
  { id: "t_carrier_bill_audited",  label: "Carrier Bill Audited?",                    category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",    dueDateRule: "", order: 7 },
  { id: "t_lineup_updated",        label: "Lineup Updated?",                          category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Coordinator", dueDateRule: "", order: 8 },
  { id: "t_oe_wrapup_email",       label: "OE Wrap-Up Email Sent?",                   category: "Post-OE", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "Account Manager",    dueDateRule: "", order: 9 },

  // ── Miscellaneous ─────────────────────────────────────────────────────────
  { id: "t_misc_followup",         label: "Client Follow-Up",                category: "Miscellaneous", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 10 },
  { id: "t_misc_document",         label: "Document Request",                category: "Miscellaneous", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 20 },
  { id: "t_misc_escalation",       label: "Escalation / Issue Resolution",   category: "Miscellaneous", markets: ["ACA","Mid-Market","Large"], defaultAssignee: "", dueDateRule: "", order: 30 },

  // ── Ongoing ──────────────────────────────────────────────────────────────
  { id: "t_blue_insights_ongoing", label: "Blue Insights Download", category: "Ongoing", markets: ["Mid-Market","Large"], carriers: ["BCBSIL"], funding: [], states: [], defaultAssignee: "Account Coordinator", dueDateRule: "", recurrence: "Quarterly", order: 10, eligibilityRule: "blue_insights" },
  { id: "t_large_claim_report",    label: "Large Claim Report — Carrier Pull & Internal Update", category: "Ongoing", markets: ["Large"], carriers: [], funding: [], states: [], defaultAssignee: "Account Manager", dueDateRule: "", recurrence: "Monthly", order: 20 },
];

function loadTasksData_DEPRECATED() {
  try {
    const saved = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!saved) return DEFAULT_TASKS_DATA;
    const loaded = JSON.parse(saved);
    // Forward-compat: merge eligibilityRule from defaults onto any task missing it
    return loaded.map(t => {
      const def = DEFAULT_TASKS_DATA.find(d => d.id === t.id);
      if (def && def.eligibilityRule && !t.eligibilityRule) {
        return { ...t, eligibilityRule: def.eligibilityRule };
      }
      return t;
    });
  } catch(e) { return DEFAULT_TASKS_DATA; }
}
function persistTasksData_DEPRECATED(list) {
  try { localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}

const CARRIER_CONTACT_ROLES = [
  "Sales Representative", "Service Team", "Account Manager",
  "Underwriting Contact", "Broker Liaison", "Enrollment Specialist",
  "Billing Contact", "Claims Contact", "General Contact",
];
const CARRIER_EMPLOYER_TYPES = ["Any", "For-Profit", "Non-Profit", "Government", "Union/Taft-Hartley", "Association"];

const CARRIER_SEGMENTS = ["ACA", "Mid-Market", "Large"];
const CARRIER_TYPES = ["National", "Regional/Local"];
const CARRIER_CATEGORIES = ["Medical", "Ancillary", "FSA/HSA/HRA Administrator"];
const PRODUCT_LIST = {
  medical:    ["Medical"],
  ancillary:  ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Worksite Benefits","Telehealth","Identity Theft","Prepaid Legal","Pet Insurance","NYDBL & PFL"],
  admin:      ["Health FSA","LP FSA","DC FSA","HSA Funding","HRA"],
};
const FUNDING_OPTIONS = ["Fully Insured","Level-Funded","Self-Funded"];

const DEFAULT_CARRIERS_DATA = [
  // ── National Medical ──────────────────────────────────────────────────────
  { id: "c_aetna", name: "Aetna", type: "National", category: "Medical",
    segments: ["ACA","Mid-Market","Large"], products: ["Medical"],
    funding: ["Fully Insured","Level-Funded","Self-Funded"],
    states: [],
    notes: "AFA (Level-Funded/Self-Funded) Underwriting Guidelines eff. 7/1/2026. Segment: SG 2-50 (TAE/eligible counting by state); SG 51+ (2-200 enrolled). IL: Eligible counting, 2-200 enrolled. AFA available 2-200 enrolled in most states (see state grid for exceptions: AK/OR 51-200, CA 5-100, KY/RI 5-200, ME 11-200, NC 3-200, UT 10-200). Participation: Contributory plans 20% of total eligible (min 2 enrolled); Non-contributory 100% of eligible. Waivers: all waiving employees must complete AFA IMQ waiver section. Dependent participation not required. Plans: up to 4 medical plans for 5+ enrolled; up to 2 for 2-4 enrolled. Billing: ACH Debit only (no checks); bills available ~25th of month; ACH debit 2nd business day of next month. Carve-outs NOT permitted. Medical UW: 101-200 enrolled groups must provide current carrier renewal, benefit summary, and claims experience. Full disclosure of claims >$25,000 required. 100% of enrolling employees/dependents must submit IMQ when required. Ineligible: associations, Taft-Hartley, employee leasing, closed groups, no employer-employee relationship. Ineligible SIC (in CA, FL, GA, IL, ME, MO): 43xx, 82xx, 8661, 91xx-97xx (govt/education/religious). Product not guaranteed renewable (CA: guaranteed renewable). RFP emails: ≤50 enrolled → SmallGroupUWQuotes@AETNA.com | 51-100 enrolled → 51-100SGPlusUWQuotes@AETNA.com. Aetna Sales Gateway self-service quoting tool coming Q3 2025 (24hr turnaround).",
    requirements: [
      { label: "AFA Segment (IL)", value: "Eligible counting, 2-200 enrolled" },
      { label: "AFA Segment (most states)", value: "2-200 enrolled (TAE or Eligible by state)" },
      { label: "AFA Segment (AK/OR)", value: "TAE counting, 51-200 enrolled" },
      { label: "AFA Segment (CA)", value: "FTE counting, 5-100 eligible" },
      { label: "Participation (contributory)", value: "20% of eligible, min 2 enrolled" },
      { label: "Participation (non-contributory)", value: "100% of eligible" },
      { label: "Max Medical Plans (5+ enrolled)", value: "4 plans" },
      { label: "Max Medical Plans (2-4 enrolled)", value: "2 plans" },
      { label: "IMQ Required", value: "101-200 enrolled; nation-wide enrolling; UW discretion" },
      { label: "Claims Disclosure", value: "Full disclosure of claims >$25,000 required" },
      { label: "Billing", value: "ACH Debit only — no checks" },
      { label: "Carve-outs", value: "Not permitted" },
      { label: "Quote Turnaround", value: "24 working hours (Sales Gateway Q3 2025)" },
    ],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Medical", segment: "ACA",        fundingMethod: "Fully Insured", type: "Flat %", amount: "4",  notes: "Standard SG commission" },
      { benefit: "Medical", segment: "Mid-Market", fundingMethod: "Fully Insured", type: "Flat %", amount: "5",  notes: "Standard MM commission" },
      { benefit: "Dental",  segment: "All",        fundingMethod: "All",           type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",  segment: "All",        fundingMethod: "All",           type: "Flat %", amount: "10", notes: "" },
    ],
    contacts: [
      { role: "Sales Representative", name: "Bridget McDowell", email: "McdowellB@aetna.com",  phone: "(630) 267-4413", market: "ACA",       employerType: "Any", fundingType: "Any", notes: "Small Group Director of Sales. Contact for escalated inquiries and upper management requests w/2-100 in-force groups and prospects." },
      { role: "Sales Representative", name: "Kevin Fazio",      email: "FazioK@aetna.com",      phone: "(773) 560-5992", market: "ACA",       employerType: "Any", fundingType: "Any", notes: "2-100 enrolled, up to 300 eligible Sales Associate. Email both Kevin and Erin on RFPs & CC quoting box." },
      { role: "Sales Representative", name: "Erin Manning",     email: "ManningE1@aetna.com",   phone: "",               market: "ACA",       employerType: "Any", fundingType: "Any", notes: "2-100 Sales Associate. Email both Kevin and Erin on RFPs & CC quoting box." },
    ] },
    { id: "c_bcbsil",  name: "BCBSIL",  type: "National", category: "Medical",
    segments: ["ACA","Mid-Market","Large"], products: ["Medical"],
    funding: ["Fully Insured","Level-Funded","Self-Funded"],
    states: ["IL"],
    notes: "Blue Balance Funded (Level-Funded): ACA small groups — min 5 enrolled, max 150 enrolled. Mid-Market — 50+ total employees. Plan families: BluePrint PPO, Blue Choice Options, Blue Choice Select PPO, BlueEdge HSA, BlueEdge Select HSA. Stop loss run-out period: 60 months. Credit possible if actual claims < claims funding. BPA required for bundled discount. BlueView exhibits available. Blue Insights reporting available. Effective Jan 1 – Dec 31, 2026.",
    requirements: [
      { label: "LF Min Enrolled (ACA/Small)", value: "5" },
      { label: "LF Max Enrolled (ACA/Small)", value: "150" },
      { label: "LF Min Total Employees (Mid-Market)", value: "50" },
      { label: "LF Max Enrolled (Mid-Market)", value: "150" },
      { label: "State Availability", value: "Illinois only" },
    ],
    commissionRules: [
      { benefit: "Medical", segment: "ACA",        fundingMethod: "Fully Insured",  type: "Flat %",  amount: "4",  notes: "Standard SG – Flat % (eff. 1/1/26)" },
      { benefit: "Medical", segment: "Mid-Market", fundingMethod: "Fully Insured",  type: "Flat %",  amount: "5",  notes: "Standard MM – Flat % (eff. 10/1/25)" },
      { benefit: "Medical", segment: "ACA",        fundingMethod: "Level-Funded",   type: "PEPM",    amount: "40", notes: "Blue Balance Funded ACA PEPM (eff. 1/1/26)" },
      { benefit: "Medical", segment: "Mid-Market", fundingMethod: "Level-Funded",   type: "PEPM",    amount: "40", notes: "Blue Balance Funded MM PEPM (eff. 10/1/25)" },
      { benefit: "Dental",  segment: "All",        fundingMethod: "All",            type: "Graded",  amount: "8",  notes: "Graded by Annual Premium Volume & Group Size. OED/AD 2-3 lives: 2% flat all tiers. OED/AD 4-150 lives: $1-$50K → 8%; $50,001-$100K → 4.25%; $100,001-$150K → 4%; $150,001+ → 3.75%" },
      { benefit: "Vision",  segment: "All",        fundingMethod: "All",            type: "Flat %",  amount: "10", notes: "" },
    ],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative",  name: "Raquel Konopacki",  email: "raquel_konopacki@bcbsil.com",    phone: "(630) 824-6830", market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Sr. Sales Exec 2-150. Led by Barb Kaufman." },
      { role: "Sales Representative",  name: "Emily Lindberg",     email: "emily_lindberg@bcbsil.com",      phone: "",               market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Marketing Service Rep, supports Raquel." },
      { role: "Sales Representative",  name: "Heather Cole",       email: "heather_cole@bcbsil.com",        phone: "(630) 824-6832", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Sr. Sales Rep 151+ enrolled." },
      { role: "Sales Representative",  name: "Alivia Doyle",       email: "alivia_doyle@bcbsil.com",        phone: "(630) 824-5307", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Marketing Service Rep, supports Heather." },
      { role: "Account Manager",       name: "Peggy Shipman",      email: "Peggy_Shipman@bcbsil.com",       phone: "(630) 824-5192", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "AE MM (51-150). Assigned Aug 2021." },
      { role: "Account Manager",       name: "Brano Gallik",       email: "brano_gallik@bcbsil.com",        phone: "(630) 824-6655", market: "Large",      employerType: "Any", fundingType: "Any", notes: "AE Large Group (150+)." },
      { role: "Account Manager",       name: "Daniel Allegretti",  email: "daniel_allegretti@bcbsil.com",   phone: "",               market: "Large",      employerType: "Any", fundingType: "Any", notes: "AE Large Group (Health Care Providers)." },
      { role: "Account Manager",       name: "Stephanie Kepuraitis",email: "kepuraitiss@bcbsil.com",         phone: "(630) 824-5515", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Major Account Executive, Large Group." },
      { role: "Service Team",          name: "ILSGAM",             email: "ilsgam@bcbsil.com",               phone: "",               market: "Any",        employerType: "Any", fundingType: "Any", notes: "Customer Service." },
      { role: "General Contact",       name: "Brian Moore",        email: "MOOREBF@BCBSIL.COM",              phone: "(630) 824-5555", market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Small Group Manager. Boss: John Collins (collinsj@bcbsil.com)." },
      { role: "General Contact",       name: "Mike Abbene",        email: "Michael_abbene@bcbsil.com",       phone: "(630) 824-6338", market: "Any",        employerType: "Any", fundingType: "Any", notes: "VP, Sales & Client Management." },
      { role: "General Contact",       name: "Jim Schuerman",      email: "schuermanj1@bcbsil.com",          phone: "(630) 824-5188", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Director of Sales & MM Account Management." },
      { role: "General Contact",       name: "George Papadatos",   email: "george_papadatos@bcbsil.com",     phone: "(630) 824-5121", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Director IL Group Market Sales (100+)." },
      { role: "General Contact",       name: "Nancy Chaidez",      email: "CHAIDEZN@BCBSIL.COM",             phone: "(630) 824-5406", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Sr. Manager, Account Management IL Group Markets." },
      { role: "General Contact",       name: "Kurt Reitzner",      email: "kurt_reitzner@bcbsil.com",        phone: "(630) 824-5130", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Senior Manager of MM AMs." },
      { role: "General Contact",       name: "Barb Kauffman",      email: "kaufmannb@bcbsil.com",            phone: "(630) 824-5510", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Sales Manager of MM Sales Reps." },
      { role: "General Contact",       name: "Erin Doyle",         email: "doylee@bcbsil.com",               phone: "",               market: "Large",      employerType: "Any", fundingType: "Any", notes: "VP, Illinois Local Account Management." },
    ],
  },
  { id: "c_cigna",   name: "Cigna",   type: "National", category: "Medical",
    segments: ["ACA","Mid-Market","Large"], products: ["Medical","Dental","Vision","Worksite Benefits"],
    funding: ["Fully Insured","Level-Funded"],
    states: [],
    notes: "FI: 51+ eligible (FTE), 50% flat participation minimum. LF: 25+ eligible, 20+ enrolled, 50% flat participation. One Health HMO (LF) available for 25+ eligible/20+ enrolled — new for July 2026. Ancillary (D,V,W combined) earns up to 3% medical discount. MHQ not required upfront but needed to firm quote. Quote turnaround 1-2 weeks. Available discounts: Implementation Credits, Guaranteed Surplus (LF), Health Funds, Renewal Guarantees. Cigna Care Designation reduces pricing 1-3%. LocalPlus Chicago available (Cook, DuPage, Kane, Kankakee, Kendall, Lake, McHenry, Will + IN Lake/LaPorte/Porter). Contacts: Sophie Zacchera (U100 NB) 312-485-1049; Katie Little (U500 Sr NB) 312-802-2717; Emily Bieda (U500 AE) 312-659-5454.",
    requirements: [
      { label: "FI Min Eligible", value: "51 FTE" },
      { label: "FI Participation", value: "50% flat" },
      { label: "LF Min Eligible", value: "25" },
      { label: "LF Min Enrolled", value: "20" },
      { label: "LF Participation", value: "50% flat" },
      { label: "One Health HMO (LF)", value: "25+ eligible / 20+ enrolled (eff. 7/1/2026+)" },
      { label: "Quote Turnaround", value: "1-2 weeks" },
      { label: "ACA FI Quote", value: "N/A" },
    ],
    commissionRules: [
      { benefit: "Medical", segment: "ACA",        fundingMethod: "Fully Insured", type: "Flat %", amount: "5", notes: "FI Medical" },
      { benefit: "Medical", segment: "Mid-Market", fundingMethod: "Fully Insured", type: "Flat %", amount: "5", notes: "FI Medical" },
      { benefit: "Dental",  segment: "All",        fundingMethod: "All",           type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",  segment: "All",        fundingMethod: "All",           type: "Flat %", amount: "10", notes: "" },
    ],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Katie (Hackett) Little", email: "Katherine.Little@cigna.com", phone: "(312) 802-2717", market: "Any", employerType: "Any", fundingType: "Any", notes: "New Business Manager 25-500 eligible. LF 25+, FI available 51+." },
      { role: "Account Manager",      name: "Brittany Barrett",        email: "Brittany.Barrett@cigna.com",            phone: "(312) 507-1330", market: "Any", employerType: "Any", fundingType: "Any", notes: "Senior Client Manager." },
      { role: "Service Team",         name: "Carin Worby",             email: "Carin.Worby@cigna.com",                 phone: "(860) 902-0418", market: "Any", employerType: "Any", fundingType: "Any", notes: "Platinum Service Lead." },
      { role: "Service Team",         name: "Karina Thompson",         email: "Karina.Martinez@cignahealthcare.com",   phone: "",               market: "Any", employerType: "Any", fundingType: "Any", notes: "Platinum Service Lead. Use instead of Carin going forward." },
      { role: "Sales Representative", name: "Josh Suber",              email: "josh_Surber@NewYorkLife.com",           phone: "(815) 953-6012", market: "Any", employerType: "Any", fundingType: "Any", notes: "Ancillary Sales Rep. Katie filters RFPs to him; contact directly for specific ancillary questions." },
      { role: "General Contact",      name: "Katie Stewart",           email: "Kathleen.stewart@cigna.com",            phone: "",               market: "Any", employerType: "Any", fundingType: "Any", notes: "Regional VP. Immediate New Business Issues." },
      { role: "General Contact",      name: "Eileen Clancy",           email: "Eileen.Clancy@Cigna.com",               phone: "(312) 648-3758", market: "Any", employerType: "Any", fundingType: "Any", notes: "Director of Client Management." },
    ],
  },
  { id: "c_uhc",     name: "UHC",     type: "National", category: "Medical",
    segments: ["ACA","Mid-Market","Large"], products: ["Medical"],
    funding: ["Fully Insured","Level-Funded","Self-Funded"],
    states: [],
    notes: "Small Group FI (ACA 1–50): Community rated; composite rates available for 10+ eligible. No underwriting required. Participation: 25% minimum participation, 50% minimum employer contribution. Commissions: Standard commission schedule.\n\nMid-Market FI (51+): GRx underwritten. No minimum participation or contribution required (though low participation may affect rates). Composite rated. Commissions: Service Fee agreement (% of premium).\n\nLevel-Funded 1–50: GRx underwriting required for replacement coverage for groups 5+ eligible. Participation: 25% minimum participation, 50% minimum employer contribution. Composite rated. Commissions: Service Fee PEPM agreement.\n\nLevel-Funded 51+: GRx underwritten. No virgin groups accepted. Minimum 50% participation and 50% contribution required. Composite rated. Commissions: Service Fee PEPM agreement.",
    requirements: [
      { label: "SG FI (ACA 1–50) Rating",        value: "Community rated; composite available 10+ eligible" },
      { label: "SG FI (ACA 1–50) Underwriting",   value: "None" },
      { label: "SG FI (ACA 1–50) Participation",  value: "25% participation / 50% contribution" },
      { label: "SG FI (ACA 1–50) Commissions",    value: "Standard commissions" },
      { label: "Mid-Market FI (51+) Underwriting", value: "GRx underwritten" },
      { label: "Mid-Market FI (51+) Participation",value: "No minimum required (low participation may affect rates)" },
      { label: "Mid-Market FI (51+) Rating",       value: "Composite rated" },
      { label: "Mid-Market FI (51+) Commissions",  value: "Service Fee agreement (% of premium)" },
      { label: "LF (1–50) Underwriting",           value: "GRx (replacing coverage, 5+ eligible)" },
      { label: "LF (1–50) Participation",          value: "25% participation / 50% contribution" },
      { label: "LF (1–50) Rating",                 value: "Composite rated" },
      { label: "LF (1–50) Commissions",            value: "Service Fee PEPM agreement" },
      { label: "LF (51+) Underwriting",            value: "GRx underwritten; no virgin groups" },
      { label: "LF (51+) Participation",           value: "50% participation / 50% contribution minimum" },
      { label: "LF (51+) Rating",                  value: "Composite rated" },
      { label: "LF (51+) Commissions",             value: "Service Fee PEPM agreement" },
    ],
    commissionRules: [
      { benefit: "Medical", segment: "ACA",        fundingMethod: "Fully Insured", type: "Flat %", amount: "5",  notes: "FI Medical – Flat %" },
      { benefit: "Medical", segment: "Mid-Market", fundingMethod: "Fully Insured", type: "Flat %", amount: "5",  notes: "FI Medical – Flat %" },
      { benefit: "Dental",  segment: "All",        fundingMethod: "All",           type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",  segment: "All",        fundingMethod: "All",           type: "Flat %", amount: "10", notes: "" },
    ],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Steve Stall / Robin Przybylski", email: "sstall@embenefits.com", phone: "(630) 238-2917", market: "ACA", employerType: "Any", fundingType: "Any", notes: "2-50 via Euclid. John Pietrowski sales rep working with Euclid." },
      { role: "Sales Representative", name: "Greg Ott", email: "gregory_ott@uhc.com", phone: "(312) 453-1706", market: "Large", employerType: "Any", fundingType: "Any", notes: "126+ lives." },
      { role: "Sales Representative", name: "Brett Helms", email: "brett_helms@uhc.com", phone: "(312) 348-3826", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Specialty / Non-Med 51-5000. Cell: 608-312-9415." },
      { role: "Account Manager", name: "Dawn Kemp", email: "dkemp@embenefits.com", phone: "(630) 238-2932", market: "Any", employerType: "Any", fundingType: "Any", notes: "VP & UHC Team lead. Manages all renewals." },
      { role: "Account Manager", name: "Sarah Zuhlke", email: "szuhlke@embenefits.com", phone: "(630) 238-2937", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Manager for new case UHC submissions." },
      { role: "Service Team", name: "Amber Loredo", email: "aloredo@embenefits.com", phone: "(630) 571-6173", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Coordinator for UHC billing, claims, customer service." },
      { role: "Service Team", name: "Ashley Alexander", email: "ashley_alexander@uhc.com", phone: "(763) 348-5065", market: "Any", employerType: "Any", fundingType: "Any", notes: "All Service." },
    ],
  },
  { id: "c_anthem",  name: "Anthem",  type: "National", category: "Medical",
    segments: ["Mid-Market","Large"], products: ["Medical"],
    funding: ["Fully Insured","Level-Funded","Self-Funded"],
    states: [], notes: "",
    requirements: [] },
  // ── Ancillary ────────────────────────────────────────────────────────────
  { id: "c_guardian",  name: "Guardian",          type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative",  name: "Marc Jackson",       email: "Marc_Jackson@glic.com",           phone: "(630) 235-2471", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Sales 25-999 eligible lives. Replaced Andrew Smith Feb 2022." },
      { role: "Sales Representative",  name: "Vincenzo Marando",   email: "vincenzo_marando@glic.com",       phone: "(610) 570-2555", market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Sales 2-24 eligible lives. Replaced Mark Phipps." },
      { role: "Sales Representative",  name: "Audrey Devries",     email: "audrey_devries@glic.com",         phone: "(312) 279-2206", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Sales Support Analyst 25-999. New business enrollment material; case profile assistance." },
      { role: "Account Manager",       name: "Morgan Smith",       email: "Morgan_Smith@glic.com",           phone: "(312) 279-2220", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Client Manager 100+ eligible lives. Renewals & plan option quotes." },
      { role: "Account Manager",       name: "Maria Robledo",      email: "maria_m_robledo@glic.com",        phone: "(312) 279-2280", market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Client Manager Associate 2-99 lives. Renewals & plan option quotes." },
      { role: "Account Manager",       name: "Sarah Labellarte",   email: "sarah_labellarte@glic.com",       phone: "(312) 279-2256", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Client Manager Associate 25-99 eligible. Note: no longer at Guardian as of 2/1/2025. Contact Maria Robledo." },
      { role: "Account Manager",       name: "Debbie Kincaid",     email: "Deborah_Kincaid@glic.com",        phone: "(610) 807-7392", market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Renewal 2-24 eligible lives. Rate relief, add lines, amend plan w/ premium change." },
      { role: "Service Team",          name: "Brianna Bryant",     email: "b_bryant@glic.com",               phone: "(800) 627-4200", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Account Service Manager. New day-to-day service contact as of 5/1/25." },
      { role: "Service Team",          name: "Erin Pierce",        email: "e_pierce@glic.com",               phone: "(855) 423-6534", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Day-to-Day Support 2-1,000 eligible lives." },
      { role: "Service Team",          name: "Taylor Johnson",     email: "ASM@glic.com",                    phone: "(216) 654-1926", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Day-to-Day Support 500+ eligible lives. Also: 800-531-9047." },
      { role: "Service Team",          name: "Beth Hopfensperger", email: "beth_hopfensperger@glic.com",     phone: "(920) 100-1310", market: "Large",      employerType: "Any", fundingType: "Any", notes: "Day-to-Day Support 100+ eligible lives." },
      { role: "Service Team",          name: "Greater Chicago Service", email: "GreaterChicagoService@glic.com", phone: "(800) 996-4779", market: "ACA",   employerType: "Any", fundingType: "Any", notes: "Dedicated Customer Response Team 2-99 eligible lives." },
      { role: "Service Team",          name: "General Guardian CRU", email: "cru@glic.com",                  phone: "(800) 627-4200", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Billing, claims, Guardian Anytime, commission info, amendments not involving premium changes." },
      { role: "General Contact",       name: "Ryan Dubiel",        email: "ryan_dubiel@glic.com",            phone: "(312) 279-2235", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Regional Sales Director." },
      { role: "General Contact",       name: "Matt McAnaney",      email: "mmcanane@glic.com",               phone: "(312) 279-5133", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Sr. Regional Sales Director. Cell: 315-481-7094." },
      { role: "General Contact",       name: "Karen Berenson",     email: "karen_berenson@glic.com",         phone: "(312) 279-5125", market: "Any",        employerType: "Any", fundingType: "Any", notes: "Regional Service Manager. Cell: 312-246-0783." },
    ],
    commissionRules: [
      { benefit: "Dental",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_principal", name: "Principal",          type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Marji Hamann", email: "Hamann.Marji@principal.com", phone: "(630) 430-8850", market: "Any", employerType: "Any", fundingType: "Any", notes: "Sales Rep. RFPs." },
      { role: "Account Manager", name: "Michael Osterhout", email: "osterhout.michael@principal.com", phone: "(630) 705-0665", market: "Any", employerType: "Any", fundingType: "Any", notes: "Client Relationship Consultant. cc on all RFPs." },
      { role: "Account Manager", name: "Joe Hunt", email: "hunt.joe@principal.com", phone: "(630) 874-8520", market: "Any", employerType: "Any", fundingType: "Any", notes: "Director of Account Management." },
      { role: "Sales Representative", name: "Mary Scherer", email: "Scherer.Mary@principal.com", phone: "", market: "Any", employerType: "Any", fundingType: "Any", notes: "Copy on all RFPs." },
      { role: "Sales Representative", name: "Joe Michalski", email: "michalski.joseph@principal.com", phone: "(630) 874-0096 x244", market: "Any", employerType: "Any", fundingType: "Any", notes: "cc on all RFPs. Note: no longer works on Marji's team." },
      { role: "Account Manager", name: "Ben Salman", email: "salman.ben@principal.com", phone: "(630) 874-9292", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Executive - Group Benefits." },
      { role: "Account Manager", name: "Rebecca Tomillo", email: "tomillo.rebecca@principal.com", phone: "", market: "Any", employerType: "Any", fundingType: "Any", notes: "Client Relationship Consultant." },
      { role: "Billing Contact", name: "Exclusive Partner", email: "exclusivepartner@principal.com", phone: "(866) 341-6588", market: "Any", employerType: "Any", fundingType: "Any", notes: "Stumm is a Principal Exclusive Partner. Billing, Member Info, Forms, Claims." },
    ],
    commissionRules: [
      { benefit: "Dental",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_mutualomaha", name: "Mutual of Omaha",  type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Austin Johnson", email: "Austin.johnson@mutualofomaha.com", phone: "(408) 205-3901", market: "Any", employerType: "Any", fundingType: "Any", notes: "Sales Rep. RFPs. Cell." },
      { role: "Sales Representative", name: "Tessa Rhodes", email: "tessa.rhodes@mutualofomaha.com", phone: "", market: "ACA", employerType: "Any", fundingType: "Any", notes: "Under 10 lives." },
      { role: "Account Manager", name: "Christy Purdy", email: "Christy.Purdy@mutualofomaha.com", phone: "(630) 472-2074", market: "Any", employerType: "Any", fundingType: "Any", notes: "Renewal Executive." },
    ],
    commissionRules: [
      { benefit: "Dental",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_unum",      name: "UNUM",               type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Dental","Vision"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Tom Knight", email: "tknight@unum.com", phone: "(312) 416-8268", market: "Large", employerType: "Any", fundingType: "Any", notes: "Sales Rep 100+. Cell: 207-357-4592." },
      { role: "Sales Representative", name: "Nick Beaulieu", email: "Nbeaulieu2@unum.com", phone: "(630) 991-7151", market: "ACA", employerType: "Any", fundingType: "Any", notes: "Sales Rep 2-99 lives." },
      { role: "Service Team", name: "RFP Team", email: "quotechicago@unum.com", phone: "", market: "Any", employerType: "Any", fundingType: "Any", notes: "Copy on all RFPs with Tom & Nick." },
      { role: "Account Manager", name: "Stephanie Johnson", email: "sjohnson4@unum.com", phone: "(423) 294-9889", market: "Large", employerType: "Any", fundingType: "Any", notes: "Client Manager 100+." },
      { role: "Service Team", name: "Ask Unum", email: "askunum@unum.com", phone: "(800) 275-8686", market: "ACA", employerType: "Any", fundingType: "Any", notes: "Client Services 2-99." },
    ],
    commissionRules: [
      { benefit: "Dental",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_sunlife",   name: "Sun Life",            type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "James Park", email: "james.park@sunlife.com", phone: "(331) 703-8930", market: "Any", employerType: "Any", fundingType: "Any", notes: "Sales Rep 2-50 and 50+." },
      { role: "Account Manager", name: "Yvonne Marmolejo-Richey", email: "yvonne.marmolejo-riche@sunlife.com", phone: "(781) 690-1983", market: "Any", employerType: "Any", fundingType: "Any", notes: "Renewal Portfolio Manager 150 and below." },
      { role: "Account Manager", name: "Kelly Keeler", email: "kelly.keeler@sunlife.com", phone: "", market: "Large", employerType: "Any", fundingType: "Any", notes: "Client Advocate 150-999." },
      { role: "Service Team", name: "Client Services", email: "clientservices@sunlife.com", phone: "(800) 247-6875", market: "Any", employerType: "Any", fundingType: "Any", notes: "1-149 lives. Disability claims, bills, contracts." },
      { role: "Billing Contact", name: "Commissions Team", email: "EBG_Commissions@sunlife.com", phone: "", market: "Any", employerType: "Any", fundingType: "Any", notes: "Schedule A commissions." },
    ],
    commissionRules: [
      { benefit: "Dental",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_metlife",   name: "MetLife (EM)",         type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Steve Stall", email: "sstall@euclidmanagers.com", phone: "(630) 238-2917", market: "Any", employerType: "Any", fundingType: "Any", notes: "VP Euclid. cc on all RFPs/Renewal items." },
      { role: "Account Manager", name: "Sarah Barrera", email: "sbarrera@euclidmanagers.com", phone: "(630) 238-2941", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Manager." },
      { role: "Account Manager", name: "Marcy Graefen", email: "marcy@euclidmanagers.com", phone: "(630) 238-2915", market: "Any", employerType: "Any", fundingType: "Any", notes: "VP. Renewals MetLife cc Steve Stall." },
      { role: "Account Manager", name: "Ashley Fenske", email: "Ashley@EuclidManagers.com", phone: "(630) 238-2942", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Manager. RFPs LifeLock & HealthiestYou cc Steve Stall." },
    ],
    commissionRules: [
      { benefit: "Dental",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",         segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_dearborn",  name: "Dearborn/Symetra",     type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Shawn Teasley", email: "Shawn_Teasley@bcbsil.com", phone: "(630) 824-5314", market: "Any", employerType: "Any", fundingType: "Any", notes: "Ancillary Sales Exec under 500 lives. All L&D quotes go to Shawn. Email: shawn.teasley@symetra.com" },
      { role: "Account Manager", name: "Robin Kulka", email: "Robin_Kulka@bcbsil.com", phone: "(630) 824-5166", market: "Any", employerType: "Any", fundingType: "Any", notes: "Ancillary Account Executive - Service & Renewals." },
      { role: "Service Team", name: "Ancillary Customer Service", email: "ancillaryquestionsIL@bcbsil.com", phone: "(800) 367-6401", market: "Any", employerType: "Any", fundingType: "Any", notes: "Customer Service, Membership Processing, Billing, Claims and Benefits." },
      { role: "Claims Contact", name: "Disability Claims", email: "DisabilityClaimsIL@bcbsil.com", phone: "", market: "Any", employerType: "Any", fundingType: "Any", notes: "Claim submission email." },
    ],
    commissionRules: [
      { benefit: "Basic Life/AD&D",segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",       segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",            segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ] },
  { id: "c_delta",     name: "Delta Dental",         type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Steve Soyke", email: "SSoyke@deltadentalil.com", phone: "(630) 718-4951", market: "ACA", employerType: "Any", fundingType: "Any", notes: "Small Business Sales Executive (2-150)." },
      { role: "Sales Representative", name: "Brent Goldsberry", email: "BGoldsberry@deltadentalil.com", phone: "(630) 718-4791", market: "Large", employerType: "Any", fundingType: "Any", notes: "Senior Sales Executive (150+)." },
      { role: "Account Manager", name: "Andrew Caniglia", email: "ACaniglia@deltadentalil.com", phone: "(630) 718-4767", market: "ACA", employerType: "Any", fundingType: "Any", notes: "Small Business Account Manager 2-150." },
      { role: "Account Manager", name: "Chrysa Kasper", email: "CKasper@deltadentalil.com", phone: "(630) 718-4760", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Account Manager. See Excel file of SI clients in Delta folder." },
      { role: "Account Manager", name: "Kathy Nelson", email: "knelson@deltadentalil.com", phone: "(630) 718-4774", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "Account Manager." },
    ],
    commissionRules: [
      { benefit: "Dental", segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
    ] },
  { id: "c_vsp",       name: "VSP",                  type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Vision"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    contacts: [
      { role: "Sales Representative", name: "Kal Sanghera", email: "kals@vsp.com", phone: "(916) 851-4820", market: "Any", employerType: "Any", fundingType: "Any", notes: "Business Development Manager." },
      { role: "Account Manager", name: "Jessica Franz", email: "jessica.franz@vsp.com", phone: "(916) 858-7716", market: "Any", employerType: "Any", fundingType: "Any", notes: "Client Manager." },
      { role: "Account Manager", name: "Jamie Elliott", email: "Jamie.Elliott@vsp.com", phone: "(916) 851-4437", market: "Any", employerType: "Any", fundingType: "Any", notes: "Key Client Manager." },
    ],
    commissionRules: [
      { benefit: "Vision", segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
    ] },
  // ── FSA/HSA/HRA Admins ───────────────────────────────────────────────────
  { id: "c_wex",       name: "WEX Health",           type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HSA Funding","HRA"],
    funding: [], states: [], notes: "", requirements: [] },
  { id: "c_flores",    name: "Flores",               type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HSA Funding","HRA"],
    funding: [], states: [], notes: "", requirements: [] },
  { id: "c_payflex",   name: "PayFlex",              type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HSA Funding"],
    funding: [], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "", commissionRules: [],
    contacts: [] },
  // ── New carriers from Carrier_Contacts.xlsx ──────────────────────────────
  { id: "c_hartford", name: "The Hartford", type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Basic Life/AD&D", segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",        segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",             segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",             segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ],
    contacts: [
      { role: "Sales Representative", name: "Kevin Madden", email: "Kevin.Madden@thehartford.com", phone: "(312) 384-7552", market: "ACA", employerType: "Any", fundingType: "Any", notes: "RFPs Under 50. Cell: 508-292-3507" },
      { role: "Sales Representative", name: "Oscar Ponce", email: "Oscar.Ponce@thehartford.com", phone: "(312) 384-7962", market: "ACA", employerType: "Any", fundingType: "Any", notes: "Replaced Kevin Madden. RFPs and general group questions. Cell: 847-361-0492" },
      { role: "Sales Representative", name: "Emily Green", email: "Emily.Green@thehartford.com", phone: "(312) 384-7536", market: "Mid-Market", employerType: "Any", fundingType: "Any", notes: "RFPs 50+. Cell: 248-568-3704" },
    ] },
  { id: "c_lincoln", name: "Lincoln Financial", type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Basic Life/AD&D", segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "Vol Life",        segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "STD",             segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
      { benefit: "LTD",             segment: "All", fundingMethod: "All", type: "Flat %", amount: "15", notes: "" },
    ],
    contacts: [
      { role: "Account Executive",  name: "Dan Jurik",     email: "daniel.jurik@lfg.com",  phone: "(773) 257-3260", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Executive / Workplace Solutions" },
      { role: "Sales Representative", name: "Holly Chladek", email: "holly.chladek@lfg.com", phone: "(414) 254-7718", market: "Any", employerType: "Any", fundingType: "Any", notes: "Sales Coordinator" },
    ] },
  { id: "c_concordia", name: "United Concordia", type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"], products: ["Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Dental", segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
    ],
    contacts: [
      { role: "Sales Representative", name: "Oliver Hansen",  email: "oliver.hansen@ucci.com", phone: "(216) 978-3324", market: "ACA",        employerType: "Any", fundingType: "Any", notes: "Sales Mgr, 2-50" },
      { role: "Sales Representative", name: "Jenna Woska",    email: "jenna.woska@ucci.com",   phone: "(412) 544-8565", market: "Mid-Market",  employerType: "Any", fundingType: "Any", notes: "Sr. Sales Director, 51+. Cell: 717-329-9377" },
      { role: "Service Team",         name: "SBU Team",       email: "uccisbu@ucci.com",        phone: "(800) 972-4191", market: "Any",         employerType: "Any", fundingType: "Any", notes: "2-99 lives. Prompt #4. Groups 100+ get dedicated AM." },
      { role: "Service Team",         name: "Wendy Cline",    email: "ucproducer@ucci.com",     phone: "(800) 972-4191", market: "Any",         employerType: "Any", fundingType: "Any", notes: "Producer Services Rep. Prompt #3." },
    ] },
  { id: "c_eyemed", name: "EyeMed", type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"], products: ["Vision"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Vision", segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "Include writing agent name (Brian Stumm) on BOR" },
    ],
    contacts: [
      { role: "Sales Representative", name: "Alyssa Esparza",  email: "aesparza2@eyemed.com",          phone: "(513) 939-6429", market: "Any", employerType: "Any", fundingType: "Any", notes: "Senior Sales Executive. Include writing agent's name (Brian Stumm) on BOR." },
      { role: "Account Manager",      name: "Kimberly Dwyer",  email: "EyeMedVisionCentral@eyemed.com", phone: "(513) 765-3666", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Manager" },
      { role: "Service Team",         name: "EyeMed Vision Central", email: "EyeMedVisionCentral@eyemed.com", phone: "", market: "Any", employerType: "Any", fundingType: "Any", notes: "BOR letters, questions on current groups/renewals/plan changes" },
    ] },
  { id: "c_ebc", name: "EBC", type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HSA Funding","HRA"],
    funding: [], states: [], notes: "Broker Paid COBRA services discounted to $50 min PEPM (normally $60); set up fee waived.", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [],
    contacts: [
      { role: "Sales Representative", name: "Andrea Visione",    email: "andrea.visione@ebcflex.com",  phone: "(608) 829-8375", market: "Any", employerType: "Any", fundingType: "Any", notes: "Regional Sales Director. See Broker Client Listing in EBC folder for client-specific service consultant." },
      { role: "Sales Representative", name: "Jenni Christianson",email: "Jenni.Christianson@ebcflex.com", phone: "(608) 729-8387", market: "Any", employerType: "Any", fundingType: "Any", notes: "Sales Operation Specialist" },
      { role: "Sales Representative", name: "Melissa Salis",     email: "melissa.salis@ebcflex.com",   phone: "(608) 829-8378", market: "Any", employerType: "Any", fundingType: "Any", notes: "Sales Operation Specialist" },
      { role: "Service Team",         name: "Kelly Hoppman",     email: "Kelly.Hoppman@ebcflex.com",   phone: "(608) 829-8394", market: "Any", employerType: "Any", fundingType: "Any", notes: "Client Services Coordinator" },
      { role: "General Contact",      name: "Brian Connelly",    email: "Brian.Connelly@ebcflex.com",  phone: "(608) 829-8307", market: "Any", employerType: "Any", fundingType: "Any", notes: "Vice President, Business Development" },
    ] },
  { id: "c_further", name: "Further", type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HSA Funding","HRA"],
    funding: [], states: [], notes: "FSA $500 annual fee and $150 POP plan fee waived for all Stumm clients.", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [],
    contacts: [
      { role: "Sales Representative", name: "Wes Pierce",            email: "Wes.Pierce@hellofurther.com", phone: "(847) 454-4718", market: "Any", employerType: "Any", fundingType: "Any", notes: "Primary contact for Stumm for both broker & group level inquiries." },
      { role: "Service Team",         name: "Account Holder Service", email: "",                             phone: "(800) 859-2144", market: "Any", employerType: "Any", fundingType: "Any", notes: "Primary service line" },
      { role: "Service Team",         name: "Client Advocates (backup)", email: "",                          phone: "(888) 460-4013", market: "Any", employerType: "Any", fundingType: "Any", notes: "Backup service line" },
    ] },
  { id: "c_asure", name: "Asure", type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HSA Funding","HRA"],
    funding: [], states: [], notes: "", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [],
    contacts: [
      { role: "Account Manager", name: "Mark Varona",    email: "mark.varona@asuresoftware.com",   phone: "(813) 867-7256", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Manager II" },
      { role: "Service Team",    name: "Client Services", email: "clientsupport@asuresoftware.com", phone: "(888) 862-6272", market: "Any", employerType: "Any", fundingType: "Any", notes: "Option 3" },
    ] },
  { id: "c_aim", name: "AIM", type: "National", category: "FSA/HSA/HRA Administrator",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Health FSA","LP FSA","DC FSA","HRA"],
    funding: [], states: [], notes: "$200 Plan Doc Prep, $50 plan amendment, $7 PEPM admin fee.", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [],
    contacts: [
      { role: "Benefits Administrator", name: "Kelly Lohman",  email: "kelly@aimadministrator.com",   phone: "(502) 426-1235", market: "Any", employerType: "Any", fundingType: "Any", notes: "Ext. 116. $200 Plan Doc Prep, $50 amendment, $7 PEPM admin fee." },
      { role: "General Contact",        name: "Michelle Cull", email: "michele@aimadministrator.com", phone: "(502) 426-1235", market: "Any", employerType: "Any", fundingType: "Any", notes: "Assistant. Ext. 116." },
    ] },
  { id: "c_petbenefit", name: "Pet Benefit Solutions", type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"], products: ["Pet Insurance"],
    funding: ["Fully Insured"], states: [], notes: "Need company name, address, website, # eligible, effective date when submitting.", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Pet Insurance", segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "10% Pet Assure & Pet Plus per active member. Pet Best: 10% year 1, 5% subsequent years." },
    ],
    contacts: [
      { role: "Sales Representative", name: "Amy Crane",               email: "amy@petbenefits.com",    phone: "",               market: "Any", employerType: "Any", fundingType: "Any", notes: "Need company name, address, website, # eligible, effective date" },
      { role: "Billing Contact",      name: "Clair Thompson-Martinez", email: "clairt@petbenefits.com", phone: "(732) 806-7083", market: "Any", employerType: "Any", fundingType: "Any", notes: "Accounts Payable Coordinator. 10% commissions Pet Assure & Pet Plus per active member." },
      { role: "Account Manager",      name: "Angela Campolattaro",     email: "angelac@petbenefits.com",phone: "(732) 719-2941", market: "Any", employerType: "Any", fundingType: "Any", notes: "Account Manager" },
    ] },
  { id: "c_centro", name: "Centro Benefits", type: "Regional/Local", category: "Ancillary",
    segments: ["ACA","Mid-Market"], products: ["Dental","Vision","Basic Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: ["IL"], notes: "cc John Gallagher on submissions; Benefits/marketing analyst assigned once RFP received.", requirements: [],
    planLimits: [], benefitDetails: "",
    commissionRules: [
      { benefit: "Dental",  segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
      { benefit: "Vision",  segment: "All", fundingMethod: "All", type: "Flat %", amount: "10", notes: "" },
    ],
    contacts: [
      { role: "Sales Representative", name: "John Gallagher", email: "john.gallagher@centrobenefits.com", phone: "(847) 609-3900", market: "Any", employerType: "Any", fundingType: "Any", notes: "Regional Sales Executive. cc on submissions." },
      { role: "General Contact",      name: "Tricia McCann",  email: "tmccann@centrobenefits.com",        phone: "(314) 369-8279", market: "Any", employerType: "Any", fundingType: "Any", notes: "Vice President" },
      { role: "Service Team",         name: "Quoting Department", email: "quote@centrobenefits.com",      phone: "",               market: "Any", employerType: "Any", fundingType: "Any", notes: "cc John Gallagher on submissions" },
    ] },
];

function loadCarriersData_DEPRECATED() {
  try {
    const saved = localStorage.getItem(CARRIERS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_CARRIERS_DATA;
  } catch(e) { return DEFAULT_CARRIERS_DATA; }
}
function persistCarriersData_DEPRECATED(list) {
  try { localStorage.setItem(CARRIERS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}

function PinScreen({ onSuccess }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    supabase.from('users').select('*').then(({ data }) => {
      if (data) setUsers(data);
    });
  }, []);

  async function handleSubmit() {
    if (!name || !pin) { setError("Please select your name and enter your PIN."); return; }
    setLoading(true);
    setError("");
    const user = users.find(u => u.name === name);
    if (!user) { setError("User not found."); setLoading(false); return; }
    if (String(user.pin) !== String(pin)) { setError("Incorrect PIN. Please try again."); setPin(""); setLoading(false); return; }
    onSuccess({ name: user.name, role: user.role, team: user.team });
  }

  const uniqueNames = [...new Set(users.map(u => u.name))].sort();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "40px 48px", maxWidth: 400, width: "100%", boxShadow: "0 25px 60px rgba(0,0,0,.12)", textAlign: "center" }}>
       <img src="/shield.png" style={{ height: 56, width: "auto", marginBottom: 16 }} alt="logo" />
        <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 24, color: "#0f172a", marginBottom: 4 }}>BOB</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 32 }}>Sign in to continue</div>

        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>Your Name</label>
          <select value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "#fff" }}>
            <option value="">— Select your name —</option>
            {uniqueNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div style={{ textAlign: "left", marginBottom: 24 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 6 }}>PIN</label>
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Enter your PIN"
            maxLength={8}
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 18, fontFamily: "inherit", letterSpacing: 8, textAlign: "center", boxSizing: "border-box" }}
          />
        </div>

        {error && <div style={{ color: "#dc2626", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#3e5878,#507c9c)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}>
          {loading ? "Checking..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
  try { return JSON.parse(sessionStorage.getItem("bt_user")) || null; }
  catch { return null; }
});

useEffect(() => {
  if (!currentUser) return;
  let timer;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      setCurrentUser(null);
      sessionStorage.removeItem("bt_user");
    }, 30 * 60 * 1000);
  };
  const events = ["mousemove","mousedown","keydown","touchstart","scroll"];
  events.forEach(e => window.addEventListener(e, reset));
  reset();
  return () => {
    clearTimeout(timer);
    events.forEach(e => window.removeEventListener(e, reset));
  };
}, [currentUser]);
  // ── Supabase data loading ──
  useEffect(() => {
    async function loadAll() {
      const [clients, carriers, tasks, ddr, meetings, teams] = await Promise.all([
        fetchClients(),
        fetchCarriers(),
        fetchTasks(),
        fetchDDR(),
        fetchMeetings(),
        fetchTeams(),
      ]);
      if (clients)  setClientsRaw(clients.map(applyDataFixes));
      if (carriers) {
        // Merge DEFAULT_CARRIERS_DATA commission rules, planLimits, and contacts
        // into Supabase carriers that are missing them — so new fields always appear
        // without needing a manual data migration
        const merged = carriers.map(c => {
          const defaults = DEFAULT_CARRIERS_DATA.find(d => d.id === c.id || d.name === c.name);
          if (!defaults) return c;
          return {
            ...c,
            // Always apply contacts and commissionRules from defaults —
            // overrides stale Supabase data until user explicitly edits them
            contacts:        (defaults.contacts       || []).length > 0 ? defaults.contacts       : (c.contacts       || []),
            commissionRules: (defaults.commissionRules|| []).length > 0 ? defaults.commissionRules: (c.commissionRules|| []),
            planLimits:      (c.planLimits && c.planLimits.length > 0)   ? c.planLimits            : (defaults.planLimits|| []),
          };
        });
        setCarriersDataRaw(merged);
      }
      if (tasks)    setTasksDataRaw(tasks);
      if (ddr)      setDueDateRulesRaw(ddr);
      if (meetings) setMeetingsRaw(meetings);
      if (teams)    setTeams(teams);
    }
    loadAll();
  }, []);
  // Load SheetJS for spreadsheet parsing
  React.useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);
   const [clients, setClientsRaw] = useState([]);
   const [modal, setModal] = useState(null); // null | client object
  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState("All");
  const [filterMarket, setFilterMarket] = useState("All");
  const [filterCarrier, setFilterCarrier] = useState("All");
  const [filterSitus, setFilterSitus] = useState("All");
  const [filterFunding, setFilterFunding] = useState("All");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  // Wrap setClients so every change is persisted to localStorage automatically
  function setClients(updater) {
    setClientsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistClients_DEPRECATED(next);
      return next;
    });
  }

  const userTeamId = currentUser?.team || null;


  function saveClient(data) {
    // Sync standard tasks before saving
    const synced = syncStandardTasks(data, tasksData);
    setClients(prev => prev.some(c => c.id === synced.id)
      ? prev.map(c => c.id === synced.id ? synced : c)
      : [...prev, synced]);
    // Sync to Supabase
    upsertClient(synced);
    // Modal stays open — user must click Cancel/✕ to close
  }

  function deleteClient(id) {
    if (confirm("Remove this client?")) {
      setClients(p => p.filter(c => c.id !== id));
      deleteClientDB(id);
    }
  }

  // Stats
  const urgentCount = clients.filter(c => { const d = daysUntil(c.renewalDate); return d !== null && d >= 0 && d <= 120; }).length;
  const overdueCount = clients.filter(c => { const d = daysUntil(c.renewalDate); return d !== null && d < 0; }).length;

  // Count clients with at least one open (Not Started / In Progress) task
  const openTasksCount = useMemo(() => {
    function hasOpenTask(c) {
      const isOpen = t => {
        const s = typeof t === "object" ? (t.status || "Not Started") : (t || "Not Started");
        return s !== "Complete" && s !== "N/A";
      };
      if (Object.values(c.compliance || {}).some(isOpen)) return true;
      if (Object.values(c.preRenewal || {}).some(isOpen)) return true;
      const oe = c.openEnrollment || {};
      if (Object.values(oe.tasks || {}).some(isOpen)) return true;
      if ((c.renewalTasks || []).some(isOpen)) return true;
      if ((c.miscTasks    || []).some(isOpen)) return true;
      if ((c.postOETasks  || []).some(isOpen)) return true;
      return false;
    }
    return clients.filter(hasOpenTask).length;
  }, [clients]);

  // View: "dashboard" | "clients" | "renewals" | "teams"
  const [view, setView] = useState(() => sessionStorage.getItem("bt_view") || "dashboard");
  const changeView = (v) => { setView(v); sessionStorage.setItem("bt_view", v); };
  const [dashNav, setDashNav] = useState({}); // { assignee, window, cat } — pre-sets for OpenTasksView
  function navToTasks(opts={}) { setDashNav(opts); changeView("overdue"); }
  const [meetings, setMeetingsRaw] = useState([]);
  function setMeetings(updater) {
    setMeetingsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistMeetings_DEPRECATED(next);
      // Sync to Supabase — upsert all meetings
      const nextArr = Array.isArray(next) ? next : [];
      nextArr.forEach(m => upsertMeeting(m));
      return next;
    });
  }
  const [teams, setTeams] = useState(() => {
    try {
           const saved = localStorage.getItem("benefittrack_teams_v1");
      return saved ? JSON.parse(saved) : Object.entries(TEAMS).map(([key, t]) => ({
        id: key, label: t.label, color: t.color, border: t.border, text: t.text,
        members: t.members,
      }));
    } catch(e) {
      return Object.entries(TEAMS).map(([key, t]) => ({
        id: key, label: t.label, color: t.color, border: t.border, text: t.text,
        members: t.members,
      }));
    }
  });
  const userTeams = React.useMemo(() => {
    if (!currentUser) return [];
    const nameLC = (currentUser.name || "").toLowerCase().trim();
    const emailLC = (currentUser.email || "").toLowerCase().trim();
    // Match against Supabase teams (live data)
    const byMembership = teams.filter(t => t.members?.some(m =>
      (m.name || "").toLowerCase().trim() === nameLC ||
      (emailLC && (m.email || "").toLowerCase().trim() === emailLC)
    )).map(t => t.id);
    // Match against hardcoded TEAMS constant (reliable fallback)
    const byHardcoded = Object.entries(TEAMS)
      .filter(([, t]) => (t.members||[]).some(m =>
        (m.name||"").toLowerCase().trim() === nameLC
      )).map(([k]) => k);
    // Match against user's stored team field
    const byTeamField = currentUser.team ? [currentUser.team] : [];
    return [...new Set([...byMembership, ...byHardcoded, ...byTeamField])];
  }, [currentUser, teams]);

  const filtered = useMemo(() => {
    const teamRestricted = currentUser && !["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && userTeams.length > 0;
    let list = clients.filter(c => {
      if (teamRestricted && !userTeams.includes(c.team)) return false;
      const q = search.toLowerCase();
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (filterTeam !== "All" && c.team !== filterTeam) return false;
      if (filterMarket !== "All" && c.marketSize !== filterMarket) return false;
      if (filterFunding !== "All" && c.fundingMethod !== filterFunding) return false;
      if (filterSitus !== "All" && (c.groupSitus || "") !== filterSitus) return false;
      if (filterCarrier !== "All") {
        const medCarrier = (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || "";
        if (medCarrier !== filterCarrier) return false;
      }
      return true;
    });
    // Sort
    list = [...list].sort((a, b) => {
      let av = "", bv = "";
      if (sortField === "name")        { av = a.name || ""; bv = b.name || ""; }
      else if (sortField === "renewal") { av = a.renewalDate || ""; bv = b.renewalDate || ""; }
      else if (sortField === "market") { av = a.marketSize || ""; bv = b.marketSize || ""; }
      else if (sortField === "carrier") {
        av = (a.benefitCarriers || {}).medical || (a.carriers || [])[0] || "";
        bv = (b.benefitCarriers || {}).medical || (b.carriers || [])[0] || "";
      }
      else if (sortField === "situs")   { av = a.groupSitus || ""; bv = b.groupSitus || ""; }
      else if (sortField === "funding") { av = a.fundingMethod || ""; bv = b.fundingMethod || ""; }
      else if (sortField === "team")    { av = a.team || ""; bv = b.team || ""; }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [clients, search, filterTeam, filterMarket, filterCarrier, filterSitus, filterFunding, sortField, sortDir, currentUser, userTeamId, userTeams]);
  const [teamModal, setTeamModal] = useState(null); // null | team object | "new"
  const [dashFilter, setDashFilter] = useState({
    team: "All", market: "All", carrier: "All", situs: "All", funding: "All",
  });
  function setDashF(key, val) { setDashFilter(p => ({ ...p, [key]: val })); }
  // Keep backward-compat alias used in renewals view team pills
  const dashboardTeamFilter = dashFilter.team;
  function setDashboardTeamFilter(val) { setDashF("team", val); }
 const [carriersData, setCarriersDataRaw] = useState([]);
  const [benefitsDb, setBenefitsDbRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem("benefittrack_benefitsdb_v2") || "[]"); }
    catch { return []; }
  });
  function setBenefitsDb(updater) {
    setBenefitsDbRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try { localStorage.setItem("benefittrack_benefitsdb_v2", JSON.stringify(next)); } catch(e) {}
      return next;
    });
  }
  function setCarriersData(updater) {
    setCarriersDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistCarriersData_DEPRECATED(next);
      // Sync each carrier to Supabase
      const nextArr = Array.isArray(next) ? next : [];
      nextArr.forEach(c => upsertCarrier(c));
      return next;
    });
  }
  const [tasksData, setTasksDataRaw] = useState([]);
  function setTasksData(updater) {
    setTasksDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistTasksData_DEPRECATED(next);
      // Sync each task to Supabase
      const nextArr = Array.isArray(next) ? next : [];
      nextArr.forEach(t => upsertTask(t));
      // Re-apply DDR to all clients when task templates change
      // AND sync standard tasks to matching clients
      setClients(prevClients => {
        const ddr = loadDueDateRules_DEPRECATED();
        return prevClients.map(c => {
          const withDDR = applyDueDateRulesToClient(c, next, ddr);
          return syncStandardTasks(withDDR, next);
        });
      });
      return next;
    });
  }

  const [dueDateRules, setDueDateRulesRaw] = useState([]);
  function setDueDateRules(updater) {
    setDueDateRulesRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistDueDateRules_DEPRECATED(next);
      // Sync each rule to Supabase
      const nextArr = Array.isArray(next) ? next : [];
      nextArr.forEach(r => upsertDDR(r));
      // Re-apply DDR to all clients with the new rule set
      setClients(prevClients => {
        const tasks = loadTasksData_DEPRECATED();
        return prevClients.map(c => applyDueDateRulesToClient(c, tasks, next));
      });
      return next;
    });
  }
  function persistTeams(list) {
    try { localStorage.setItem("benefittrack_teams_v1", JSON.stringify(list)); } catch(e) {}
    // Sync to Supabase
    const listArr = Array.isArray(list) ? list : [];
    listArr.forEach(t => upsertTeam(t));
  }

  // Upcoming renewals within 120 days, sorted soonest first
  const upcoming120 = useMemo(() => {
    return clients
      .map(c => ({ ...c, _days: daysUntil(c.renewalDate) }))
      .filter(c => c._days !== null && c._days >= 0 && c._days <= 120)
      .sort((a, b) => a._days - b._days);
  }, [clients]);

  const overdueClients = useMemo(() => {
    return clients
      .map(c => ({ ...c, _days: daysUntil(c.renewalDate) }))
      .filter(c => c._days !== null && c._days < 0)
      .sort((a, b) => a._days - b._days); // most overdue first
  }, [clients]);

  if (!currentUser) {
  return <PinScreen onSuccess={user => { setCurrentUser(user); sessionStorage.setItem("bt_user", JSON.stringify(user)); }} />;
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#f8fafc",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f1f5f9; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
        select, input, textarea { outline: none; }
        select:focus, input:focus, textarea:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,.12); }
        .stat-tile { transition: box-shadow .15s, transform .15s; }
        .stat-tile:hover { box-shadow: 0 6px 20px rgba(0,0,0,.1) !important; transform: translateY(-1px); }
      `}</style>

      {/* Top bar */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 32px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
         <img src="/shield.png" style={{ height: 44, width: "auto" }} alt="logo" /> 
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 18, color: "#0f172a", lineHeight: 1 }}>
              BOB
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Client Renewal Management</div>
           <div style={{ fontSize: 11, color: "#507c9c", marginTop: 2, fontWeight: 600 }}>👤 {currentUser.name}</div> 
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Nav tabs */}
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 9, padding: 3, gap: 2 }}>
            {[["dashboard","🏠 Dashboard"],["clients","👥 All Clients"],["renewals","⏰ Renewals"],["meetings","📋 Meetings"],["teams","🤝 Teams"],["carriers","📋 Carriers"],["tasks","✅ Tasks"],["benefitsDb","💊 Benefits"],...(["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) ? [["reports","📊 Reports"]] : [])].map(([v, label]) => (
              <button key={v} onClick={() => changeView(v)} style={{
                background: view === v ? "#fff" : "transparent",
                border: "none", borderRadius: 7, padding: "6px 14px",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                color: view === v ? "#1d4ed8" : "#64748b",
                boxShadow: view === v ? "0 1px 4px rgba(0,0,0,.1)" : "none",
                transition: "all .15s",
              }}>{label}</button>
            ))}
          </div>
<div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setCurrentUser(null); sessionStorage.removeItem("bt_user"); }} style={{ ...btnOutline, fontSize: 12, padding: "7px 14px" }}>Sign Out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 32px" }}>



        {/* ── DASHBOARD VIEW ── */}
        {view === "dashboard" && (() => {
          const role = currentUser?.role?.trim() || "";
          const isLead = ["Team Lead","VP","Lead"].includes(role);
          const isAE   = role === "Account Executive";
          const isAM   = role === "Account Manager";
          const isAC   = role === "Account Coordinator";

          const hour = new Date().getHours();
          const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
          const todayStr = new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});

          const myTeamObjs  = teams.filter(t => userTeams.includes(t.id));
          const myTeamLabel = myTeamObjs.length > 1
            ? myTeamObjs.map(t => "Team "+t.label).join(" & ")
            : myTeamObjs[0] ? "Team "+myTeamObjs[0].label : "";
          const myClients   = clients.filter(c => userTeams.length > 0 ? userTeams.includes(c.team) : true);
          const myUpcoming  = myClients
            .map(c => ({ ...c, _days: daysUntil(c.renewalDate) }))
            .filter(c => c._days !== null && c._days >= 0 && c._days <= 120)
            .sort((a,b) => a._days - b._days);
          const myUpcoming30 = myUpcoming.filter(c => c._days <= 30);

          const myAllTasks = myClients.flatMap(c =>
            collectOpenTasks(c, null, tasksData).map(t => ({ ...t, clientId:c.id, clientName:c.name, clientObj:c }))
          );
          const myTasks = isLead ? myAllTasks : myAllTasks.filter(t => (t.assignee||"") === currentUser.name);
          const myOverdueTasks = myTasks.filter(t => t.dueDate && new Date(t.dueDate+"T23:59:59") < new Date());
          const myDueThisWeek  = myTasks.filter(t => {
            if (!t.dueDate) return false;
            const d = new Date(t.dueDate+"T23:59:59"), now = new Date(), end = new Date();
            end.setDate(now.getDate()+7);
            return d >= now && d <= end;
          });

          const tasksByAssignee = {};
          myAllTasks.forEach(t => {
            const a = t.assignee || "Unassigned";
            if (!tasksByAssignee[a]) tasksByAssignee[a] = [];
            tasksByAssignee[a].push(t);
          });

          function getTaskRoleBadge(t) {
            const tmpl = (tasksData||[]).find(td => td.id === t.taskId || td.label === t.label);
            const da = tmpl?.defaultAssignee || "";
            if (da === "Account Coordinator") return "AC";
            if (da === "Account Manager")     return "AM";
            if (da === "Account Executive")   return "AE";
            return null;
          }

          const perfByMember = {};
          myAllTasks.forEach(t => {
            const a = t.assignee||""; if (!a) return;
            if (!perfByMember[a]) perfByMember[a] = {total:0,onTime:0};
            if (t.completedDate) {
              perfByMember[a].total++;
              const due = t.plannedDueDate || t.dueDate;
              if (!due || t.completedDate <= due) perfByMember[a].onTime++;
            }
          });

          const AVATAR_COLORS = {
            D:{bg:"#d1fae5",color:"#065f46"},
            M:{bg:"#dbeafe",color:"#1e40af"},
            K:{bg:"#fce7f3",color:"#9d174d"},
            R:{bg:"#dce8f2",color:"#3e5878"}
          };
          const ROLE_BADGE = {
            AC:{bg:"#fce7f3",color:"#9d174d",border:"#f9a8d4"},
            AM:{bg:"#dbeafe",color:"#1e40af",border:"#93c5fd"},
            AE:{bg:"#d1fae5",color:"#065f46",border:"#6ee7b7"}
          };
          // Team colors for client tiles — India=blue, Juliet=green
          const TEAM_TILE_COLORS = {
            India:  {bg:"#eff6ff", border:"#93c5fd", accent:"#1e40af", dot:"#3b82f6"},
            Juliet: {bg:"#f0fdf4", border:"#86efac", accent:"#166534", dot:"#22c55e"},
          };

          function Avatar({name}) {
            const init = (name||"?")[0].toUpperCase();
            const s = AVATAR_COLORS[init]||{bg:"#dce8f2",color:"#3e5878"};
            return <div style={{width:30,height:30,borderRadius:"50%",background:s.bg,color:s.color,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,letterSpacing:"-0.5px"}}>{init}</div>;
          }

          function RoleBadge({role}) {
            if (!role) return null;
            const s = ROLE_BADGE[role]||{bg:"#f1f5f9",color:"#475569",border:"#e2e8f0"};
            return <span style={{fontSize:9,padding:"2px 6px",borderRadius:6,fontWeight:800,background:s.bg,color:s.color,border:"0.5px solid "+s.border,flexShrink:0,letterSpacing:"0.3px"}}>{role}</span>;
          }

          function UrgBadge({days,dueDate}) {
            let diff, label;
            if (dueDate) {
              const d = new Date(dueDate+"T23:59:59"), now = new Date(); now.setHours(0,0,0,0);
              diff = Math.round((d-now)/(1000*60*60*24));
              label = diff < 0 ? Math.abs(diff)+"d overdue" : diff === 0 ? "due today" : diff+" days";
            } else if (days !== undefined) {
              diff = days; label = days+" days";
            } else return null;
            const urgent = diff < 0;
            const warn   = !urgent && diff <= 30;
            const bg     = urgent ? "#fee2e2" : warn ? "#fef3c7" : "#eff6ff";
            const color  = urgent ? "#991b1b" : warn ? "#92400e" : "#1e40af";
            return <span style={{fontSize:10,padding:"3px 8px",borderRadius:20,fontWeight:700,background:bg,color,whiteSpace:"nowrap",flexShrink:0}}>{label}</span>;
          }

          const completedThisWeek = myAllTasks.filter(t => {
            if (!t.completedDate) return false;
            const d = new Date(t.completedDate+"T12:00:00"), now = new Date(), start = new Date();
            start.setDate(now.getDate()-7);
            return d >= start && d <= now && (isLead || (t.assignee||"") === currentUser.name);
          }).length;

          const myMeetings = [...meetings]
            .filter(m => userTeams.length === 0 || userTeams.includes(m.team))
            .sort((a,b) => b.date.localeCompare(a.date)).slice(0,3);

          const myFollowUps = myClients.flatMap(c => {
            const allT = [
              ...Object.entries(c.preRenewal||{}).map(([,v])=>({task:v,client:c})),
              ...Object.entries(c.compliance||{}).map(([,v])=>({task:v,client:c})),
              ...(c.renewalTasks||[]).map(v=>({task:v,client:c})),
              ...(c.miscTasks||[]).map(v=>({task:v,client:c})),
              ...(c.postOETasks||[]).map(v=>({task:v,client:c})),
              ...(c.transactions||[]).map(v=>({task:v,client:c})),
            ];
            return allT.flatMap(({task,client}) =>
              (task?.followUps||[])
                .filter(fu => fu.date && fu.date <= new Date().toISOString().split("T")[0])
                .filter(() => isLead || (task.assignee||"") === currentUser.name)
                .map(fu => ({...fu, clientName:client.name, clientObj:client}))
            );
          }).slice(0,5);

          const topTasks = (isLead ? myAllTasks : myTasks)
            .filter(t => t.dueDate).sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,6);

          const topTasksByAssignee = Object.entries(tasksByAssignee)
            .filter(([a]) => a !== "Unassigned")
            .map(([a, tasks]) => {
              const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate+"T23:59:59") < new Date());
              const next = [...tasks].filter(t=>t.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
              return {name:a, total:tasks.length, overdue:overdue.length, next};
            }).sort((a,b) => b.overdue - a.overdue);

          const perf = Object.entries(perfByMember)
            .filter(([a]) => a !== "Unassigned")
            .map(([name, {total,onTime}]) => ({name, rate:total>0?Math.round((onTime/total)*100):null, total}))
            .filter(p => p.total > 0).sort((a,b) => (a.rate||0)-(b.rate||0));

          // ── Styled sub-components ─────────────────────────────────────────
          function Panel({title, sub, children, accent}) {
            const hdrBg  = accent ? accent+"18" : "#f8fafc";
            const hdrBdr = accent ? accent+"40" : "#e8ecf0";
            const hdrTxt = accent || "#3e5878";
            return (
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #e8ecf0",overflow:"hidden",boxShadow:"0 1px 3px rgba(62,88,120,.06)"}}>
                <div style={{padding:"11px 16px",borderBottom:"1px solid "+hdrBdr,background:hdrBg,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,fontWeight:800,color:hdrTxt,letterSpacing:"0.2px"}}>{title}</span>
                  {sub && <span style={{fontSize:11,color:"#94a3b8",fontWeight:500}}>{sub}</span>}
                </div>
                {children}
              </div>
            );
          }

          const rowHover = {onMouseEnter:e=>e.currentTarget.style.background="#f0f5fa",onMouseLeave:e=>e.currentTarget.style.background="transparent"};

          function TaskRow({task, showAvatar, useTeamColor}) {
            const role = getTaskRoleBadge(task);
            const teamKey = task.clientObj ? (Object.keys(TEAMS).find(k=>k===task.clientObj.team||TEAMS[k]?.label===task.clientObj.team)||task.clientObj.team) : null;
            const tc = useTeamColor && teamKey ? (TEAM_TILE_COLORS[teamKey]||null) : null;
            return (
              <div style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",transition:"background .1s",background:tc?tc.bg:"transparent"}}
                onMouseEnter={e=>e.currentTarget.style.background=tc?tc.border+"40":"#f0f5fa"}
                onMouseLeave={e=>e.currentTarget.style.background=tc?tc.bg:"transparent"}
                onClick={() => setModal(task.clientObj)}>
                {tc && <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:tc.dot,flexShrink:0}}></div>}
                {showAvatar && <Avatar name={task.assignee} />}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:13,color:tc?tc.accent:"#0f172a"}}>{task.label}</span>
                    <RoleBadge role={role} />
                  </div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                    {task.clientName}
                    {tc && <span style={{marginLeft:6,fontSize:10,fontWeight:700,color:tc.accent}}>Team {TEAMS[teamKey]?.label||teamKey}</span>}
                  </div>
                </div>
                <UrgBadge dueDate={task.dueDate} />
              </div>
            );
          }

          function ClientRow({c, useTeamColor}) {
            const mc = (c.benefitCarriers||{}).medical||(c.carriers||[])[0]||"";
            const teamKey = Object.keys(TEAMS).find(k=>k===c.team||TEAMS[k]?.label===c.team)||c.team;
            const tc = useTeamColor ? (TEAM_TILE_COLORS[teamKey]||{bg:"#fff",border:"#e2e8f0",accent:"#3e5878",dot:"#94a3b8"}) : null;
            return (
              <div style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"background .1s",background: tc ? tc.bg : "transparent"}}
                onMouseEnter={e=>e.currentTarget.style.background=tc?tc.border+"40":"#f0f5fa"}
                onMouseLeave={e=>e.currentTarget.style.background=tc?tc.bg:"transparent"}
                onClick={() => setModal(c)}>
                {tc && <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:tc.dot,flexShrink:0}}></div>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:tc?tc.accent:"#0f172a"}}>{c.name}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                    {formatDate(c.renewalDate)}{mc?" · "+mc:""}
                    {tc && <span style={{marginLeft:6,fontSize:10,fontWeight:700,color:tc.accent}}>Team {TEAMS[teamKey]?.label||teamKey}</span>}
                  </div>
                </div>
                <UrgBadge days={c._days} />
              </div>
            );
          }

          function StatTile({label, value, type, sub, onClick, icon}) {
            const palette = {
              danger:  {bg:"#fff1f2",border:"#fecdd3",val:"#be123c",lbl:"#9f1239"},
              warning: {bg:"#fffbeb",border:"#fde68a",val:"#b45309",lbl:"#92400e"},
              success: {bg:"#f0fdf4",border:"#bbf7d0",val:"#15803d",lbl:"#166534"},
              info:    {bg:"#eff6ff",border:"#bfdbfe",val:"#1d4ed8",lbl:"#1e40af"},
              default: {bg:"#f8fafc",border:"#e2e8f0",val:"#3e5878",lbl:"#507c9c"},
            };
            const p = palette[type||"default"];
            return (
              <div onClick={onClick}
                style={{background:p.bg,borderRadius:12,padding:"16px 18px",border:"1px solid "+p.border,cursor:onClick?"pointer":"default",transition:"all .15s",position:"relative",overflow:"hidden"}}
                onMouseEnter={e=>{if(onClick){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,.1)";}}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
                <div style={{fontSize:28,fontWeight:800,color:p.val,lineHeight:1,marginBottom:4}}>{value}</div>
                <div style={{fontSize:12,fontWeight:600,color:p.lbl}}>{label}</div>
                {sub && <div style={{fontSize:10,color:p.lbl,opacity:.7,marginTop:2}}>{sub}</div>}
                {onClick && <div style={{position:"absolute",right:14,bottom:12,fontSize:16,color:p.val,opacity:.4}}>→</div>}
              </div>
            );
          }

          // ── Layout ────────────────────────────────────────────────────────
          return (
            <div>
              {/* Greeting banner */}
              <div style={{
                background:"linear-gradient(135deg, #3e5878 0%, #507c9c 100%)",
                borderRadius:16, padding:"20px 28px", marginBottom:20,
                display:"flex", alignItems:"center", justifyContent:"space-between",
                boxShadow:"0 4px 16px rgba(62,88,120,.25)",
              }}>
                <div>
                  <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontWeight:800,fontSize:22,color:"#fff",lineHeight:1.2}}>
                    {greeting}, {currentUser.name}
                  </div>
                  <div style={{fontSize:12,color:"rgba(255,255,255,.75)",marginTop:6,fontWeight:500}}>
                    {todayStr}
                    {myTeamLabel && <span style={{marginLeft:10,padding:"2px 10px",borderRadius:20,background:"rgba(255,255,255,.15)",color:"#fff",fontWeight:600}}>{myTeamLabel}</span>}
                    {myClients.length > 0 && <span style={{marginLeft:8,color:"rgba(255,255,255,.6)"}}>{myClients.length} clients</span>}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginBottom:2}}>Today's date</div>
                  <div style={{fontSize:22,fontWeight:800,color:"#fff",lineHeight:1}}>{new Date().getDate()}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>{new Date().toLocaleDateString("en-US",{month:"short",year:"numeric"})}</div>
                </div>
              </div>

              {/* Stat tiles */}
              {isLead && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <StatTile label="Renewing in 30 days" value={myUpcoming30.length} type="danger" onClick={() => changeView("renewals")} />
                  <StatTile label="Renewing in 120 days" value={myUpcoming.length} type="warning" onClick={() => changeView("renewals")} />
                  <StatTile label="Open tasks" value={myAllTasks.length} type="info" onClick={() => navToTasks({})} />
                  <StatTile label="Completed this week" value={completedThisWeek} type="success" />
                </div>
              )}
              {(isAE || isAM) && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                  <StatTile label="Renewing in 120 days" value={myUpcoming.length} type="danger" onClick={() => changeView("renewals")} />
                  <StatTile label="My tasks due this week" value={myDueThisWeek.length} type="warning" onClick={() => navToTasks({assignee:currentUser.name})} />
                  <StatTile label="Completed this week" value={completedThisWeek} type="success" />
                </div>
              )}
              {isAC && (
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                  <StatTile label="Tasks overdue" value={myOverdueTasks.length} type="danger" onClick={() => navToTasks({assignee:currentUser.name,window:"overdue"})} />
                  <StatTile label="Due this week" value={myDueThisWeek.length} type="warning" onClick={() => navToTasks({assignee:currentUser.name})} />
                  <StatTile label="Completed this week" value={completedThisWeek} type="success" />
                </div>
              )}

              {/* Main panels */}
              {isLead && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <Panel title="Upcoming renewals" sub="next 120 days" accent="#3e5878">
                      {myUpcoming.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No renewals in 120 days</div>
                        : myUpcoming.slice(0,5).map(c => <ClientRow key={c.id} c={c} useTeamColor={false} />)
                      }
                    </Panel>
                    <Panel title="Team performance" sub="on-time rate" accent="#3e5878">
                      {perf.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No completion data yet</div>
                        : perf.map(p => {
                            const init = (p.name||"?")[0].toUpperCase();
                            const av = AVATAR_COLORS[init]||{bg:"#dce8f2",color:"#3e5878"};
                            const barColor = (p.rate||0)>=85?"#16a34a":(p.rate||0)>=70?"#d97706":"#dc2626";
                            const mRole = teams.flatMap(t=>t.members||[]).find(m=>m.name===p.name)?.role||"";
                            const roleAbbr = mRole==="Account Coordinator"?"AC":mRole==="Account Manager"?"AM":mRole==="Account Executive"?"AE":null;
                            return (
                              <div key={p.name}
                                style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"background .1s"}}
                                {...rowHover} onClick={() => navToTasks({assignee:p.name})}>
                                <div style={{width:30,height:30,borderRadius:"50%",background:av.bg,color:av.color,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{init}</div>
                                <div style={{flex:1,display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                                  <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{p.name}</span>
                                  {roleAbbr && <RoleBadge role={roleAbbr} />}
                                </div>
                                {p.rate!==null ? <>
                                  <div style={{width:90,height:6,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
                                    <div style={{width:p.rate+"%",height:"100%",borderRadius:3,background:barColor}}></div>
                                  </div>
                                  <span style={{fontSize:12,fontWeight:800,color:barColor,minWidth:34,textAlign:"right"}}>{p.rate}%</span>
                                </> : <span style={{fontSize:11,color:"#94a3b8"}}>No data</span>}
                              </div>
                            );
                          })
                      }
                    </Panel>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <Panel title="Open tasks by member" sub="most urgent first" accent="#3e5878">
                      {topTasksByAssignee.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No open tasks</div>
                        : topTasksByAssignee.map(({name,total,overdue,next}) => {
                            const init = (name||"?")[0].toUpperCase();
                            const av = AVATAR_COLORS[init]||{bg:"#dce8f2",color:"#3e5878"};
                            const mRole = teams.flatMap(t=>t.members||[]).find(m=>m.name===name)?.role||"";
                            const roleAbbr = mRole==="Account Coordinator"?"AC":mRole==="Account Manager"?"AM":mRole==="Account Executive"?"AE":null;
                            return (
                              <div key={name}
                                style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",transition:"background .1s"}}
                                {...rowHover} onClick={() => navToTasks({assignee:name})}>
                                <div style={{width:30,height:30,borderRadius:"50%",background:av.bg,color:av.color,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{init}</div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{name}</span>
                                    {roleAbbr && <RoleBadge role={roleAbbr} />}
                                  </div>
                                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                                    {total} task{total!==1?"s":""}{overdue>0&&<span style={{color:"#be123c",fontWeight:700}}> · {overdue} overdue</span>}
                                    {next&&" · "+next.label}
                                  </div>
                                </div>
                                {next && <UrgBadge dueDate={next.dueDate} />}
                              </div>
                            );
                          })
                      }
                    </Panel>
                    <Panel title="Recent meetings" accent="#3e5878">
                      {myMeetings.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No meetings recorded</div>
                        : myMeetings.map(m => {
                            const tObj = teams.find(t=>t.id===m.team);
                            const tc = tObj ? (TEAM_TILE_COLORS[tObj.id]||TEAM_TILE_COLORS[tObj.label]||null) : null;
                            return (
                              <div key={m.id}
                                style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"background .1s"}}
                                {...rowHover} onClick={() => changeView("meetings")}>
                                <div style={{width:38,textAlign:"center",flexShrink:0}}>
                                  <div style={{fontSize:14,fontWeight:800,color:"#3e5878"}}>{new Date(m.date+"T12:00:00").getDate()}</div>
                                  <div style={{fontSize:9,color:"#94a3b8",fontWeight:600,textTransform:"uppercase"}}>{new Date(m.date+"T12:00:00").toLocaleDateString("en-US",{month:"short"})}</div>
                                </div>
                                <div style={{flex:1}}>
                                  <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{tObj?"Team "+tObj.label+" meeting":m.notes?.slice(0,40)||"Team meeting"}</div>
                                  <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{(m.taskReviews||[]).length} tasks reviewed</div>
                                </div>
                                {tc && <span style={{fontSize:10,padding:"3px 8px",borderRadius:20,background:tc.bg,color:tc.accent,fontWeight:700,border:"1px solid "+tc.border}}>{tObj.label}</span>}
                              </div>
                            );
                          })
                      }
                    </Panel>
                  </div>
                </div>
              )}

              {(isAE||isAM) && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <Panel title="My clients renewing soon" accent="#3e5878">
                      {myUpcoming.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No upcoming renewals</div>
                        : myUpcoming.slice(0,5).map(c => <ClientRow key={c.id} c={c} useTeamColor={false} />)
                      }
                    </Panel>
                    {myFollowUps.length>0 && (
                      <Panel title="Follow-ups due" accent="#b45309">
                        {myFollowUps.map((fu,i) => (
                          <div key={i} style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"background .1s"}}
                            {...rowHover} onClick={() => setModal(fu.clientObj)}>
                            <div style={{flex:1}}>
                              <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{fu.note||"Follow-up"}</div>
                              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{fu.clientName}</div>
                            </div>
                            <UrgBadge dueDate={fu.date} />
                          </div>
                        ))}
                      </Panel>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <Panel title="My tasks" sub="assigned to me" accent="#3e5878">
                      {topTasks.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No open tasks</div>
                        : topTasks.map((t,i) => <TaskRow key={i} task={t} showAvatar={false} />)
                      }
                    </Panel>
                    <Panel title="Team tasks on my clients" sub="needs attention" accent="#be123c">
                      {myAllTasks.filter(t=>t.assignee!==currentUser.name&&t.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,4).map((t,i) => (
                        <TaskRow key={i} task={t} showAvatar={true} />
                      ))}
                    </Panel>
                  </div>
                </div>
              )}

              {isAC && (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <Panel title="My tasks — most urgent first" accent="#3e5878">
                    {topTasks.length===0
                      ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No open tasks</div>
                      : topTasks.map((t,i) => <TaskRow key={i} task={t} showAvatar={false} useTeamColor={true} />)
                    }
                  </Panel>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <Panel title="Upcoming renewals" sub="by team" accent="#3e5878">
                      {myUpcoming.length===0
                        ? <div style={{padding:"24px",textAlign:"center",color:"#94a3b8",fontSize:12}}>No upcoming renewals</div>
                        : myUpcoming.slice(0,5).map(c => <ClientRow key={c.id} c={c} useTeamColor={true} />)
                      }
                    </Panel>
                    {myFollowUps.length>0 && (
                      <Panel title="Follow-ups due" accent="#b45309">
                        {myFollowUps.map((fu,i) => {
                          const fuTeamKey = fu.clientObj ? (Object.keys(TEAMS).find(k=>k===fu.clientObj.team||TEAMS[k]?.label===fu.clientObj.team)||fu.clientObj.team) : null;
                          const fuTc = fuTeamKey ? (TEAM_TILE_COLORS[fuTeamKey]||null) : null;
                          return (
                            <div key={i} style={{padding:"10px 16px",borderBottom:"1px solid #f4f6f8",display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"background .1s",background:fuTc?fuTc.bg:"transparent"}}
                              onMouseEnter={e=>e.currentTarget.style.background=fuTc?fuTc.border+"40":"#f0f5fa"}
                              onMouseLeave={e=>e.currentTarget.style.background=fuTc?fuTc.bg:"transparent"}
                              onClick={() => setModal(fu.clientObj)}>
                              {fuTc && <div style={{width:3,alignSelf:"stretch",borderRadius:2,background:fuTc.dot,flexShrink:0}}></div>}
                              <div style={{flex:1}}>
                                <div style={{fontWeight:700,fontSize:13,color:fuTc?fuTc.accent:"#0f172a"}}>{fu.note||"Follow-up"}</div>
                                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>
                                  {fu.clientName}
                                  {fuTc && <span style={{marginLeft:6,fontSize:10,fontWeight:700,color:fuTc.accent}}>Team {TEAMS[fuTeamKey]?.label||fuTeamKey}</span>}
                                </div>
                              </div>
                              <UrgBadge dueDate={fu.date} />
                            </div>
                          );
                        })}
                      </Panel>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── RENEWALS VIEW ── */}
        {view === "renewals" && (() => {
          const allCarriersR = [...new Set(clients.map(c =>
            (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || ""
          ).filter(Boolean))].sort();
          const allSitusR   = [...new Set(clients.map(c => c.groupSitus || "").filter(Boolean))].sort();
          const allFundingR = [...new Set(clients.map(c => c.fundingMethod || "").filter(Boolean))].sort();

          const teamRestricted3 = currentUser && !["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && userTeams.length > 0;
          const renewalsFiltered = upcoming120.filter(c => {
            if (teamRestricted3 && !userTeams.includes(c.team)) return false;
            if (dashFilter.team    !== "All" && c.team !== dashFilter.team) return false;
            if (dashFilter.market  !== "All" && c.marketSize !== dashFilter.market) return false;
            if (dashFilter.funding !== "All" && c.fundingMethod !== dashFilter.funding) return false;
            if (dashFilter.situs   !== "All" && (c.groupSitus || "") !== dashFilter.situs) return false;
            if (dashFilter.carrier !== "All") {
              const mc = (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || "";
              if (mc !== dashFilter.carrier) return false;
            }
            return true;
          });

          const activeRFilters = Object.values(dashFilter).filter(v => v !== "All").length;

          return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
                  Upcoming Renewals
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Next 120 days — {renewalsFiltered.length} of {upcoming120.length} client{upcoming120.length !== 1 ? "s" : ""}
                  {activeRFilters > 0 && (
                    <button onClick={() => setDashFilter({ team: "All", market:"All",carrier:"All",situs:"All",funding:"All" })}
                      style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, color: "#ef4444",
                        background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Clear {activeRFilters} filter{activeRFilters > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => changeView("dashboard")} style={{ ...btnOutline, fontSize: 12 }}>← Back</button>
            </div>

            {/* Filter bar — same structure as dashboard */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {/* Team dropdown — Leads/VP only */}
              {["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && (
                <select value={dashFilter.team} onChange={e => setDashF("team", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 140px",
                    background: dashFilter.team !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Teams</option>
                  {Object.entries(TEAMS).map(([key, t]) => (
                    <option key={key} value={key}>Team {t.label}</option>
                  ))}
                </select>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={dashFilter.market} onChange={e => setDashF("market", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 130px",
                    background: dashFilter.market !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Markets</option>
                  {MARKET_SIZES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={dashFilter.funding} onChange={e => setDashF("funding", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 140px",
                    background: dashFilter.funding !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Funding</option>
                  {allFundingR.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={dashFilter.carrier} onChange={e => setDashF("carrier", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 140px",
                    background: dashFilter.carrier !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Carriers</option>
                  {allCarriersR.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={dashFilter.situs} onChange={e => setDashF("situs", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 135px",
                    background: dashFilter.situs !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Situs</option>
                  {allSitusR.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {renewalsFiltered.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "48px 20px", textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#64748b" }}>
                  No renewals in the next 120 days{activeRFilters > 0 ? " matching these filters" : ""}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 18 }}>
                {renewalsFiltered.map(c => (
                  <ClientCard key={c.id} client={c} onEdit={setModal} onDelete={deleteClient} tasksDb={tasksData} currentUser={currentUser} />
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── OPEN TASKS VIEW ── */}
        {view === "overdue" && (
          <OpenTasksView clients={clients} onOpenClient={setModal} tasksDb={tasksData} onUpdateTask={saveClient} currentUser={currentUser} userTeamId={userTeamId} userTeams={userTeams} dashNav={dashNav} />
        )}


        {/* ── TEAMS VIEW ── */}
        {view === "teams" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
                  Teams
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{teams.length} team{teams.length !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => changeView("dashboard")} style={{ ...btnOutline, fontSize: 12 }}>← Back</button>
                {["Team Lead","VP","Lead","Account Executive"].includes(currentUser?.role?.trim()) && (
                  <button onClick={() => setTeamModal({ id: "", label: "", members: [] })} style={btnPrimary}>+ Add Team</button>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
              {teams.map(team => (
                <div key={team.id} style={{
                  background: "#fff", borderRadius: 14,
                  border: `2px solid ${team.border || "#e2e8f0"}`,
                  borderTop: `4px solid ${team.border || "#e2e8f0"}`,
                  padding: "18px 20px",
                  boxShadow: "0 2px 8px rgba(0,0,0,.05)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{
                      fontFamily: "'Playfair Display',Georgia,serif",
                      fontWeight: 800, fontSize: 17, color: "#0f172a",
                    }}>Team {team.label}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setTeamModal({ ...team })} style={{
                        background: "#f1f5f9", border: "none", borderRadius: 7,
                        padding: "4px 10px", fontSize: 12, color: "#475569", cursor: "pointer", fontWeight: 600,
                      }}>Edit</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sortMembers(team.members).map((m, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 10px", borderRadius: 8,
                        background: team.color || "#f8fafc",
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: team.border || "#e2e8f0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: "#fff",
                        }}>{(m.name || "?")[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: team.text || "#0f172a" }}>{m.name}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{m.role}</div>
                          {m.email && (
                            <div style={{ fontSize: 10, color: "#94a3b8" }}>{m.email}</div>
                          )}
                        </div>
                      </div>
                    ))}
                    {(team.members || []).length === 0 && (
                      <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>No members yet</div>
                    )}
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
                      {clients.filter(c => c.team === team.id).length} client{clients.filter(c => c.team === team.id).length !== 1 ? "s" : ""}
                    </div>
                    {["Team Lead","VP","Lead","Account Executive"].includes(currentUser?.role?.trim()) && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
                          {formatRevenue(clients.filter(c => c.team === team.id).reduce((sum, c) => sum + parseRevenue(c.annualRevenue), 0))}
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>Annual Revenue</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CLIENTS VIEW ── */}
        {view === "clients" && (() => {
          // Derive unique values for filter dropdowns from full client list
          const uniqueCarriers = [...new Set(clients.map(c =>
            (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || ""
          ).filter(Boolean))].sort();
          const uniqueSitus = [...new Set(clients.map(c => c.groupSitus || "").filter(Boolean))].sort();
          const uniqueFunding = [...new Set(clients.map(c => c.fundingMethod || "").filter(Boolean))].sort();

          const SortBtn = ({ field, label }) => {
            const active = sortField === field;
            return (
              <button onClick={() => toggleSort(field)} style={{
                background: active ? "#dce8f0" : "#f8fafc",
                border: `1px solid ${active ? "#4a7fa5" : "#e2e8f0"}`,
                borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: active ? 800 : 600,
                color: active ? "#2d4a6b" : "#475569", cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {label}
                <span style={{ fontSize: 10, opacity: active ? 1 : 0.4 }}>
                  {active ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅"}
                </span>
              </button>
            );
          };

          const activeFilterCount = [
            filterCarrier !== "All", filterSitus !== "All", filterFunding !== "All",
            filterTeam !== "All", filterMarket !== "All", search !== "",
          ].filter(Boolean).length;

          return (
          <div>
           
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setModal(newClient(tasksData))} style={btnPrimary}>+ Add Client</button>
                    <label title="Import from spreadsheet" style={{ ...btnPrimary, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                      📂 Import
                      <input type="file" accept=".xlsx,.xls" style={{ display: "none" }}
                        onChange={e => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = evt => {
                            try {
                              const XLSX = window.XLSX;
                              if (!XLSX) { alert("Spreadsheet reader not loaded yet — please try again in a moment."); return; }
                              const wb = XLSX.read(evt.target.result, { type: "array" });
                              const ws = wb.Sheets[wb.SheetNames[0]];
                              const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
                              const client = parseClientSpreadsheet(raw, tasksData);
                              setModal(client);
                            } catch(err) {
                              alert("Could not parse spreadsheet: " + err.message);
                            }
                            e.target.value = "";
                          };
                          reader.readAsArrayBuffer(file);
                        }}
                      />
                    </label>
 
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {filtered.length} of {clients.length} shown
                  {activeFilterCount > 0 && (
                    <button onClick={() => {
                      setSearch(""); setFilterTeam("All"); setFilterMarket("All");
                      setFilterCarrier("All"); setFilterSitus("All"); setFilterFunding("All");
                    }} style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, color: "#ef4444",
                      background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                    </button>
                  )}
                </div>

            </div>

            {/* Filters row 1: search + core filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍  Search clients..."
                style={{ ...inputStyle, flex: "1 1 200px", minWidth: 160 }}
              />
              {(["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) || userTeams.length > 1) && (
                <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                  style={{ ...inputStyle, flex: "0 0 150px", background: filterTeam !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Teams</option>
                  {(["Team Lead","VP","Lead"].includes(currentUser?.role?.trim())
                    ? Object.keys(TEAMS)
                    : userTeams
                  ).map(k => <option key={k} value={k}>Team {k}</option>)}
                </select>
              )}
              <select value={filterMarket} onChange={e => setFilterMarket(e.target.value)}
                style={{ ...inputStyle, flex: "0 0 150px", background: filterMarket !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Markets</option>
                {MARKET_SIZES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={filterFunding} onChange={e => setFilterFunding(e.target.value)}
                style={{ ...inputStyle, flex: "0 0 155px", background: filterFunding !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Funding</option>
                {uniqueFunding.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <select value={filterCarrier} onChange={e => setFilterCarrier(e.target.value)}
                style={{ ...inputStyle, flex: "0 0 155px", background: filterCarrier !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Carriers</option>
                {uniqueCarriers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterSitus} onChange={e => setFilterSitus(e.target.value)}
                style={{ ...inputStyle, flex: "0 0 150px", background: filterSitus !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Situs</option>
                {uniqueSitus.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Sort bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginRight: 2 }}>SORT:</span>
              <SortBtn field="name"    label="Name" />
              <SortBtn field="renewal" label="Renewal" />
              <SortBtn field="team"    label="Team" />
              <SortBtn field="market"  label="Market Size" />
              <SortBtn field="carrier" label="Carrier" />
              <SortBtn field="situs"   label="Situs" />
              <SortBtn field="funding" label="Funding" />
            </div>

            {/* Grid */}
            {filtered.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "80px 20px", color: "#94a3b8",
                background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#64748b" }}>No clients found</div>
                <div style={{ fontSize: 14, marginTop: 6 }}>Try adjusting your filters</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 18 }}>
                {filtered.map(c => (
                  <ClientCard key={c.id} client={c} onEdit={setModal} onDelete={deleteClient} tasksDb={tasksData} currentUser={currentUser} />
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {view === "meetings" && (
          <MeetingsView
            meetings={meetings}
            onSave={setMeetings}
            clients={clients}
            teams={teams}
            onUpdateClient={saveClient}
            tasksDb={tasksData}
            onOpenClient={setModal}
            currentUser={currentUser}
            userTeamId={userTeamId}
            userTeams={userTeams}
          />
        )}

        {view === "carriers" && (
          <CarriersView
            carriers={carriersData}
            onSave={setCarriersData}
            currentUser={currentUser}
          />
        )}

        {view === "benefitsDb" && (
          <BenefitsDbView
            benefitsDb={benefitsDb}
            onSave={setBenefitsDb}
            currentUser={currentUser}
          />
        )}

        {view === "tasks" && (
          <TasksView
            tasks={tasksData}
            onSave={setTasksData}
            dueDateRules={dueDateRules}
            onSaveDueDateRules={setDueDateRules}
            currentUser={currentUser}
          />
        )}

        {view === "reports" && ["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && (
          <ReportsView clients={clients} currentUser={currentUser} teams={teams} />
        )}
        {view === "reports" && !["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>
            Reports are available to Team Leads and above.
          </div>
        )}


      </div>

      {modal && (
        <ClientModal client={modal} onSave={saveClient} onClose={() => setModal(null)} tasksDb={tasksData} onSaveCarrier={setCarriersData} dueDateRules={dueDateRules} benefitsDb={benefitsDb} carriersData={carriersData} currentUser={currentUser} />
      )}

      {/* Team Edit/Add Modal */}
      {teamModal && (
        <TeamEditModal
          team={teamModal}
          onSave={t => {
            const isNew = !t.id || !teams.some(x => x.id === t.id);
            const finalTeam = isNew
              ? { ...t, id: t.label.replace(/\s+/g,"_").toLowerCase() || ("team_" + Date.now()), color: t.color || "#f1f5f9", border: t.border || "#94a3b8", text: t.text || "#475569", createdBy: currentUser?.name || "" }
              : t;
            const updated = isNew
              ? [...teams, finalTeam]
              : teams.map(x => x.id === finalTeam.id ? finalTeam : x);
            setTeams(updated);
            persistTeams(updated);
            setTeamModal(null);
            if (isNew) alert(`Team "${finalTeam.label}" was saved successfully.`);
            // If the logged-in user's name was changed in this team, update sessionStorage
            if (currentUser) {
              const oldTeam = teams.find(x => x.id === finalTeam.id);
              if (oldTeam) {
                const oldMember = (oldTeam.members || []).find(m =>
                  m.name === currentUser.name || m.email === currentUser.email
                );
                const newMember = oldMember
                  ? (finalTeam.members || []).find(m => m.email === oldMember.email || m.name === oldMember.name)
                  : null;
                if (newMember && newMember.name !== currentUser.name) {
                  const updated = { ...currentUser, name: newMember.name, role: newMember.role || currentUser.role };
                  setCurrentUser(updated);
                  sessionStorage.setItem("bt_user", JSON.stringify(updated));
                }
              }
            }
          }}
          onDelete={id => {
            if (confirm("Delete this team?")) {
              const updated = teams.filter(t => t.id !== id);
              setTeams(updated);
              persistTeams(updated);
              setTeamModal(null);
            }
          }}
          onClose={() => setTeamModal(null)}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

// ── Team Edit Modal ──────────────────────────────────────────────────────────

// ── Reports View ──────────────────────────────────────────────────────────────
function ReportsView({ clients, currentUser, teams }) {
  const [tab, setTab] = React.useState("performance");
  const [auditLogs, setAuditLogs] = React.useState([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [filterUser, setFilterUser] = React.useState("");
  const [filterField, setFilterField] = React.useState("");
  const [filterFrom, setFilterFrom] = React.useState("");
  const [filterTo, setFilterTo] = React.useState("");
  const [drillMember, setDrillMember] = React.useState(null);

  // Load audit logs when tab is selected
  React.useEffect(() => {
    if (tab !== "audit") return;
    setAuditLoading(true);
    fetchAuditLogs({
      userName: filterUser || undefined,
      field: filterField || undefined,
      from: filterFrom || undefined,
      to: filterTo ? filterTo + "T23:59:59Z" : undefined,
    }).then(rows => { setAuditLogs(rows || []); setAuditLoading(false); });
  }, [tab, filterUser, filterField, filterFrom, filterTo]);

  // ── Build performance data from client task records ──────────────────────
  const perfData = React.useMemo(() => {
    const memberMap = {};
    function record(assignee, dueDate, completedDate, plannedDueDate, taskLabel, category, clientName) {
      if (!assignee) return;
      if (!memberMap[assignee]) memberMap[assignee] = { name: assignee, total: 0, onTime: 0, late: 0, lateTasks: [], totalDays: 0 };
      const m = memberMap[assignee];
      if (!completedDate || !dueDate) return; // only count completed tasks
      m.total++;
      const due = new Date(dueDate);
      const done = new Date(completedDate);
      const days = Math.round((done - due) / 86400000);
      m.totalDays += days;
      if (days <= 0) { m.onTime++; }
      else {
        m.late++;
        m.lateTasks.push({ taskLabel, category, clientName, dueDate, plannedDueDate, completedDate, daysLate: days });
      }
    }
    function walkTasks(group, clientName) {
      Object.entries(group || {}).forEach(([, t]) => {
        if (typeof t !== "object" || !t.assignee) return;
        record(t.assignee, t.dueDate, t.completedDate, t.plannedDueDate, t.label || "", "", clientName);
      });
    }
    clients.forEach(c => {
      const name = c.name;
      // Fixed task groups
      ["preRenewal","compliance","postOEFixed"].forEach(g => {
        Object.entries(c[g] || {}).forEach(([id, t]) => {
          if (typeof t !== "object") return;
          record(t.assignee, t.dueDate, t.completedDate, t.plannedDueDate, id, g, name);
        });
      });
      // OE tasks
      Object.entries(c.openEnrollment?.tasks || {}).forEach(([id, t]) => {
        if (typeof t !== "object") return;
        record(t.assignee, t.dueDate, t.completedDate, t.plannedDueDate, id, "Open Enrollment", name);
      });
      // Array tasks
      ["renewalTasks","postOETasks","miscTasks","transactions"].forEach(g => {
        (c[g] || []).forEach(t => {
          record(t.assignee, t.dueDate, t.completedDate, t.plannedDueDate, t.label || t.title || "", g, name);
        });
      });
      // Extra tasks
      [c.preRenewal?.__extra, c.compliance?.__extra, c.openEnrollment?.tasks?.__extra].forEach(arr => {
        (arr || []).forEach(t => record(t.assignee, t.dueDate, t.completedDate, t.plannedDueDate, t.title || "", "Extra", name));
      });
    });
    return Object.values(memberMap).sort((a, b) => b.total - a.total);
  }, [clients]);

  const allMembers = [...new Set(perfData.map(m => m.name))];

  const tabStyle = active => ({
    padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: "none", fontFamily: "inherit",
    background: active ? "#3e5878" : "#f1f5f9",
    color: active ? "#fff" : "#64748b",
  });

  const card = { background: "#fff", borderRadius: 12, border: "1.5px solid #e2e8f0", padding: "16px 20px", marginBottom: 12 };
  const th = { padding: "8px 12px", fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".6px", textAlign: "left", borderBottom: "2px solid #e2e8f0" };
  const td = { padding: "8px 12px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9" };
  const tdMuted = { ...td, color: "#64748b" };

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>📊 Reports</h2>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>Task performance, team metrics, and change history</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[["performance","👥 Team Performance"],["audit","📋 Audit Log"],["benchmarks","⏱ Task Benchmarks"]].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setDrillMember(null); }} style={tabStyle(tab === id)}>{label}</button>
        ))}
      </div>

      {/* ── Team Performance Tab ── */}
      {tab === "performance" && !drillMember && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
            {perfData.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No completed tasks with assignees and due dates found yet.</p>}
            {perfData.map(m => {
              const pct = m.total > 0 ? Math.round((m.onTime / m.total) * 100) : 0;
              const avgDays = m.total > 0 ? (m.totalDays / m.total).toFixed(1) : "—";
              const color = pct >= 90 ? "#16a34a" : pct >= 70 ? "#ca8a04" : "#dc2626";
              return (
                <div key={m.name} style={{ ...card, cursor: "pointer" }} onClick={() => setDrillMember(m)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{m.name}</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color }}>{pct}%</span>
                  </div>
                  <div style={{ background: "#f1f5f9", borderRadius: 6, height: 8, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 6, transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b" }}>
                    <span>✅ {m.onTime} on time</span>
                    <span style={{ color: m.late > 0 ? "#dc2626" : "#94a3b8" }}>⚠️ {m.late} late</span>
                    <span>Avg {avgDays > 0 ? "+" : ""}{avgDays}d</span>
                  </div>
                  {m.late > 0 && <div style={{ marginTop: 8, fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>Click to see late tasks →</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Drill-down: Late Tasks for a Member ── */}
      {tab === "performance" && drillMember && (
        <div>
          <button onClick={() => setDrillMember(null)} style={{ ...tabStyle(false), marginBottom: 16, fontSize: 12 }}>← Back to all members</button>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>{drillMember.name} — Late Tasks</h3>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>{drillMember.late} task{drillMember.late !== 1 ? "s" : ""} completed past due date</p>
          {drillMember.lateTasks.length === 0
            ? <p style={{ color: "#94a3b8", fontSize: 13 }}>No late tasks — great work!</p>
            : (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Client","Task","Category","Planned Due","Adjusted Due","Completed","Days Late"].map(h => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillMember.lateTasks.sort((a,b) => b.daysLate - a.daysLate).map((t, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={td}>{t.clientName}</td>
                        <td style={td}>{t.taskLabel}</td>
                        <td style={tdMuted}>{t.category}</td>
                        <td style={tdMuted}>{t.plannedDueDate || "—"}</td>
                        <td style={{ ...tdMuted, color: t.plannedDueDate && t.dueDate !== t.plannedDueDate ? "#ca8a04" : "#64748b" }}>
                          {t.dueDate}{t.plannedDueDate && t.dueDate !== t.plannedDueDate ? " ✎" : ""}
                        </td>
                        <td style={tdMuted}>{t.completedDate}</td>
                        <td style={{ ...td, color: "#dc2626", fontWeight: 700 }}>+{t.daysLate}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ── Audit Log Tab ── */}
      {tab === "audit" && (
        <div>
          {/* Filters */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "flex-end" }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
              Team Member
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", minWidth: 160 }}>
                <option value="">All Members</option>
                {allMembers.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
              Field Changed
              <select value={filterField} onChange={e => setFilterField(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", minWidth: 140 }}>
                <option value="">All Fields</option>
                {["status","dueDate","assignee","completedDate"].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
              From
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit" }} />
            </label>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", display: "flex", flexDirection: "column", gap: 4 }}>
              To
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: 13, fontFamily: "inherit" }} />
            </label>
            <button onClick={() => { setFilterUser(""); setFilterField(""); setFilterFrom(""); setFilterTo(""); }}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#64748b" }}>
              Clear
            </button>
          </div>

          {auditLoading && <p style={{ color: "#94a3b8", fontSize: 13 }}>Loading...</p>}
          {!auditLoading && auditLogs.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13 }}>No audit log entries found. Changes to task status, due dates, and assignees will appear here going forward.</p>}
          {!auditLoading && auditLogs.length > 0 && (
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Date & Time","Changed By","Client","Category","Task","Field","Old Value","New Value"].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, i) => (
                    <tr key={log.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={tdMuted}>{new Date(log.created_at).toLocaleString()}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{log.user_name}</td>
                      <td style={td}>{log.client_name}</td>
                      <td style={tdMuted}>{log.category}</td>
                      <td style={td}>{log.task_label}</td>
                      <td style={{ ...tdMuted, fontStyle: "italic" }}>{log.field}</td>
                      <td style={{ ...tdMuted, textDecoration: "line-through" }}>{log.old_value || "—"}</td>
                      <td style={{ ...td, color: "#16a34a", fontWeight: 600 }}>{log.new_value || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Task Benchmarks Tab ── */}
      {tab === "benchmarks" && (
        <div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Average days early (negative) or late (positive) by task category, across all completed tasks.</p>
          {(() => {
            const catMap = {};
            clients.forEach(c => {
              function tally(group, category) {
                Object.entries(group || {}).forEach(([, t]) => {
                  if (typeof t !== "object" || !t.dueDate || !t.completedDate) return;
                  const days = Math.round((new Date(t.completedDate) - new Date(t.dueDate)) / 86400000);
                  if (!catMap[category]) catMap[category] = { total: 0, days: 0, late: 0, onTime: 0 };
                  catMap[category].total++;
                  catMap[category].days += days;
                  days > 0 ? catMap[category].late++ : catMap[category].onTime++;
                });
              }
              tally(c.preRenewal, "Pre-Renewal");
              tally(c.compliance, "Compliance");
              tally(c.postOEFixed, "Post-OE");
              tally(c.openEnrollment?.tasks, "Open Enrollment");
              (c.renewalTasks||[]).filter(t=>t.dueDate&&t.completedDate).forEach(t => {
                const days = Math.round((new Date(t.completedDate)-new Date(t.dueDate))/86400000);
                if (!catMap["Renewal"]) catMap["Renewal"]={total:0,days:0,late:0,onTime:0};
                catMap["Renewal"].total++; catMap["Renewal"].days+=days;
                days>0?catMap["Renewal"].late++:catMap["Renewal"].onTime++;
              });
              (c.miscTasks||[]).filter(t=>t.dueDate&&t.completedDate).forEach(t => {
                const days = Math.round((new Date(t.completedDate)-new Date(t.dueDate))/86400000);
                if (!catMap["Miscellaneous"]) catMap["Miscellaneous"]={total:0,days:0,late:0,onTime:0};
                catMap["Miscellaneous"].total++; catMap["Miscellaneous"].days+=days;
                days>0?catMap["Miscellaneous"].late++:catMap["Miscellaneous"].onTime++;
              });
              (c.transactions||[]).filter(t=>t.dueDate&&t.completedDate).forEach(t => {
                const days = Math.round((new Date(t.completedDate)-new Date(t.dueDate))/86400000);
                if (!catMap["Transactions"]) catMap["Transactions"]={total:0,days:0,late:0,onTime:0};
                catMap["Transactions"].total++; catMap["Transactions"].days+=days;
                days>0?catMap["Transactions"].late++:catMap["Transactions"].onTime++;
              });
            });
            const rows = Object.entries(catMap).sort((a,b)=>b[1].days/b[1].total - a[1].days/a[1].total);
            if (rows.length === 0) return <p style={{ color: "#94a3b8", fontSize: 13 }}>No completed tasks with due dates yet.</p>;
            return (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Category","Completed Tasks","On Time","Late","Avg Days +/-"].map(h=><th key={h} style={th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map(([cat, s], i) => {
                      const avg = (s.days / s.total).toFixed(1);
                      const color = avg > 0 ? "#dc2626" : avg < 0 ? "#16a34a" : "#64748b";
                      return (
                        <tr key={cat} style={{ background: i%2===0?"#fff":"#fafafa" }}>
                          <td style={{ ...td, fontWeight: 700 }}>{cat}</td>
                          <td style={tdMuted}>{s.total}</td>
                          <td style={{ ...td, color: "#16a34a" }}>{s.onTime}</td>
                          <td style={{ ...td, color: s.late > 0 ? "#dc2626" : "#94a3b8" }}>{s.late}</td>
                          <td style={{ ...td, color, fontWeight: 700 }}>{avg > 0 ? "+" : ""}{avg}d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}


function TeamEditModal({ team, onSave, onDelete, onClose, currentUser }) {
  const [data, setData] = useState({ ...team });
  const isLead = ["Team Lead","VP","Lead"].includes(currentUser?.role?.trim());
  const isAE = currentUser?.role?.trim() === "Account Executive";
  const canDeleteTeam = isLead || (isAE && (team.createdBy === currentUser?.name || data.createdBy === currentUser?.name));

  function setField(k, v) { setData(p => ({ ...p, [k]: v })); }

  function addMember() { setData(p => ({ ...p, members: [...(p.members||[]), { name: "", role: "" }] })); }
  function updateMember(i, k, v) {
    setData(p => { const m = [...(p.members||[])]; m[i] = { ...m[i], [k]: v }; return { ...p, members: m }; });
  }
  function removeMember(i) {
    setData(p => ({ ...p, members: (p.members||[]).filter((_, idx) => idx !== i) }));
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.55)",
      zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680,
        maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 60px rgba(0,0,0,.2)",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>{data.id && team.id ? "Edit Team" : "New Team"}</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#64748b" }}>✕</button>
        </div>
        <div style={{ overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b" }}>
            Team Name
            <input value={data.label || ""} onChange={e => setField("label", e.target.value)}
              placeholder="e.g. India, Juliet"
              style={{ display: "block", width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginTop: 4, fontFamily: "inherit" }} />
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Members</div>
            {(data.members || []).map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input value={m.name || ""} onChange={e => updateMember(i, "name", e.target.value)}
                  placeholder="Name"
                  style={{ padding: "7px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }} />
                <select value={m.role || ""} onChange={e => updateMember(i, "role", e.target.value)}
                  style={{ padding: "7px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }}>
                  <option value="">— Select Role —</option>
                  <option value="VP">VP</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Account Executive">Account Executive</option>
                  <option value="Account Manager">Account Manager</option>
                  <option value="Account Coordinator">Account Coordinator</option>
                </select>
                <input type="email" value={m.email || ""} onChange={e => updateMember(i, "email", e.target.value)}
                  placeholder="email@company.com"
                  style={{ padding: "7px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }} />
                {canDeleteTeam && (
                  <button onClick={() => removeMember(i)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700 }}>✕</button>
                )}
                {!canDeleteTeam && <div />}
              </div>
            ))}
            <button onClick={addMember} style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700,
              border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
              cursor: "pointer", fontFamily: "inherit",
            }}>+ Add Member</button>
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 10, background: "#f8fafc" }}>
          <div>
            {team.id && canDeleteTeam && (
              <button onClick={() => onDelete(data.id)} style={{ background: "#fee2e2", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#991b1b", cursor: "pointer", fontFamily: "inherit" }}>Delete Team</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={() => onSave(data)} style={{ background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save Team</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Benefits constants ────────────────────────────────────────────────────────
const BENEFITS_DB_CATEGORIES = ["Core Health","Life & AD&D","Income Protection","Statutory Income","Worksite","Wellness","Lifestyle","Tax-Advantaged"];

const BENEFITS_DB_OPTIONS = {
  planDesign: {
    "Core Health":        ["PPO","HMO","EPO","HDHP","DMO","Network","Embedded","Stand-alone"],
    "Life & AD&D":        ["Flat $ Amount","Salary Multiple","Incremental Elections ($10k units)","Incremental Elections ($25k units)"],
    "Income Protection":  ["% of Income","Benefit Increments ($50 units)","Benefit Increments ($100 units)"],
    "Statutory Income":   ["State-Defined Benefit Formula"],
    "Worksite":           ["Fixed Schedule of Benefits","Condition/Treatment-Based Payouts","Lump Sum by Diagnosis","Per Diem / Admission Benefits"],
    "Wellness":           ["Embedded","Stand-alone"],
    "Lifestyle":          ["Embedded","Stand-alone","Reimbursement Model"],
    "Tax-Advantaged":     ["Health FSA","Limited Purpose FSA","Dependent Care FSA","HSA (paired w/ HDHP)","HRA (ICHRA / QSEHRA / Integrated)","Transit / Parking (Sec. 132(f))"],
  },
  variant: {
    "Core Health":        ["Medical","Dental","Vision","Rx","Behavioral Health"],
    "Life & AD&D":        ["Basic Life","Basic AD&D","Supplemental Life","Supplemental AD&D","Dependent Life","Voluntary Life","Voluntary AD&D"],
    "Income Protection":  ["Short-Term Disability (STD)","Long-Term Disability (LTD)","Voluntary STD","Voluntary LTD"],
    "Statutory Income":   ["NY DBL","NY PFL","NJ TDI","NJ FLI","CA SDI","CA PFL","WA PFML","MA PFML","CT PFML","OR PFML","CO FAMLI"],
    "Worksite":           ["Accident","Critical Illness","Cancer","Hospital Indemnity"],
    "Wellness":           ["EAP","Telehealth","Wellness Program"],
    "Lifestyle":          ["Pet Insurance","Identity Theft Protection","Legal Services (Prepaid)","Financial Wellness","Commuter Benefits"],
    "Tax-Advantaged":     ["Health FSA","Limited Purpose FSA","Dependent Care FSA","HSA","HRA","ICHRA","QSEHRA","Transit","Parking"],
  },
  fundingMethod:    ["Fully Insured","Level-Funded","Self-Insured","State","Trust/Custodial","Self-Insured (Unfunded)","Unfunded"],
  billingMethod:    ["Composite","Age-Based","Age-Banded","Composite/Age-Based","Composite/Age-Banded","Age-Issued/Age-Attained","N/A"],
  contributionMethod: ["Non-Contributory","Contributory","Voluntary","Non-Contrib / Contrib","Non-Contrib / Contrib / Voluntary","Contrib (Employee)"],
  planType:         ["Sec. 105","Sec. 125","Sec. 105 / 125","Sec. 79","After-tax / 125","125 (if pre-tax)","After-tax","Sec. 223","Sec. 132(f)","State","N/A"],
  erisa:            ["Yes","No"],
  ndtApplicability: ["Yes","No","Yes (105(h) if self-funded)","Yes (if self-funded)","Yes (key employee test)","Yes (125)","Yes (125 + 105(h) for HFSA)","Yes (comparability)","Limited","No"],
};

const BENEFITS_DB_SEED = [
  { id:"bds_1",  benefit:"Medical",           category:"Core Health",       planDesign:"PPO / HMO / EPO / HDHP / Indemnity",    variant:"",  fundingMethod:"Fully Insured / Level-Funded / Self-Insured", billingMethod:"Composite/Age-Based",     contributionMethod:"Non-Contrib / Contrib",             planType:"Sec. 105 / 125", erisa:"Yes", ndtApplicability:"Yes (105(h) if self-funded)",      notes:"" },
  { id:"bds_2",  benefit:"Dental",            category:"Core Health",       planDesign:"PPO / DMO / Indemnity",                  variant:"",  fundingMethod:"Fully Insured / Self-Insured",                billingMethod:"Composite/Age-Based",     contributionMethod:"Non-Contrib / Contrib / Voluntary", planType:"Sec. 105 / 125", erisa:"Yes", ndtApplicability:"Yes (if self-funded)",             notes:"" },
  { id:"bds_3",  benefit:"Vision",            category:"Core Health",       planDesign:"PPO / Network / Indemnity",              variant:"",  fundingMethod:"Fully Insured / Self-Insured",                billingMethod:"Composite",               contributionMethod:"Non-Contrib / Contrib / Voluntary", planType:"Sec. 105 / 125", erisa:"Yes", ndtApplicability:"Yes (if self-funded)",             notes:"" },
  { id:"bds_4",  benefit:"Telehealth",        category:"Core Health",       planDesign:"Embedded / Stand-alone",                 variant:"",  fundingMethod:"Fully Insured / Self-Insured",                billingMethod:"Composite",               contributionMethod:"Non-Contrib / Contrib",             planType:"Sec. 105",       erisa:"Yes", ndtApplicability:"Yes (if stand-alone/self-funded)", notes:"" },
  { id:"bds_5",  benefit:"Base Life/AD&D",    category:"Life & AD&D",       planDesign:"Flat $ / Salary Multiple",               variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite",               contributionMethod:"Non-Contrib",                       planType:"Sec. 79",        erisa:"Yes", ndtApplicability:"Yes (key employee test)",          notes:"" },
  { id:"bds_6",  benefit:"Vol Life",          category:"Life & AD&D",       planDesign:"Increments",                             variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Age-Banded",              contributionMethod:"Voluntary",                         planType:"After-tax / 125", erisa:"Yes", ndtApplicability:"Limited",                         notes:"" },
  { id:"bds_7",  benefit:"AD&D",              category:"Life & AD&D",       planDesign:"Increments",                             variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite/Age-Banded",    contributionMethod:"",                                  planType:"",               erisa:"Yes", ndtApplicability:"Limited",                         notes:"" },
  { id:"bds_8",  benefit:"STD",               category:"Income Protection", planDesign:"% of Income / Benefit Increments",       variant:"",  fundingMethod:"Fully Insured / Self-Insured",                billingMethod:"Composite/Age-Banded",    contributionMethod:"Non-Contrib / Contrib / Voluntary", planType:"125 (if pre-tax)", erisa:"Yes", ndtApplicability:"No",                              notes:"" },
  { id:"bds_9",  benefit:"LTD",               category:"Income Protection", planDesign:"% of Income / Benefit Increments",       variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite/Age-Banded",    contributionMethod:"Non-Contrib / Contrib / Voluntary", planType:"125 (if pre-tax)", erisa:"Yes", ndtApplicability:"No",                              notes:"" },
  { id:"bds_10", benefit:"IDI",               category:"Income Protection", planDesign:"% of Income / Benefit Increments",       variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite/Age-Banded",    contributionMethod:"",                                  planType:"",               erisa:"Yes", ndtApplicability:"No",                              notes:"" },
  { id:"bds_11", benefit:"NYDBL & PFL",       category:"Statutory Income",  planDesign:"State-defined benefit formula",          variant:"",  fundingMethod:"State / Fully Insured",                       billingMethod:"Composite",               contributionMethod:"Non-Contrib* / Contrib*",           planType:"State",          erisa:"No",  ndtApplicability:"No",                              notes:"Contribution rules vary by state" },
  { id:"bds_12", benefit:"Accident",          category:"Worksite",          planDesign:"Fixed schedule of benefits",             variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite",               contributionMethod:"Voluntary",                         planType:"Sec. 125",       erisa:"Yes", ndtApplicability:"Yes (125)",                        notes:"" },
  { id:"bds_13", benefit:"Cancer",            category:"Worksite",          planDesign:"Condition/treatment-based payouts",      variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Age-Issued/Age-Attained", contributionMethod:"Voluntary",                         planType:"Sec. 125",       erisa:"Yes", ndtApplicability:"Yes (125)",                        notes:"" },
  { id:"bds_14", benefit:"Critical Illness",  category:"Worksite",          planDesign:"Lump sum by diagnosis",                  variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Age-Issued/Age-Attained", contributionMethod:"Voluntary",                         planType:"Sec. 125",       erisa:"Yes", ndtApplicability:"Yes (125)",                        notes:"" },
  { id:"bds_15", benefit:"Hospital Indemnity",category:"Worksite",          planDesign:"Per diem / admission benefits",          variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite",               contributionMethod:"Voluntary",                         planType:"Sec. 125",       erisa:"Yes", ndtApplicability:"Yes (125)",                        notes:"" },
  { id:"bds_16", benefit:"EAP",               category:"Wellness",          planDesign:"Embedded / Stand-alone",                 variant:"",  fundingMethod:"Fully Insured / Self-Insured",                billingMethod:"Composite",               contributionMethod:"Non-Contrib / Contrib / Voluntary", planType:"Sec. 105",       erisa:"Yes", ndtApplicability:"No",                              notes:"" },
  { id:"bds_17", benefit:"Identity Theft",    category:"Lifestyle",         planDesign:"Embedded / Stand-alone",                 variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite",               contributionMethod:"Voluntary",                         planType:"125 (if pre-tax)", erisa:"Yes", ndtApplicability:"Yes (125)",                       notes:"" },
  { id:"bds_18", benefit:"Prepaid Legal",     category:"Lifestyle",         planDesign:"Embedded / Stand-alone",                 variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite",               contributionMethod:"Voluntary",                         planType:"Sec. 125",       erisa:"Yes", ndtApplicability:"Yes (125)",                        notes:"" },
  { id:"bds_19", benefit:"Pet Insurance",     category:"Lifestyle",         planDesign:"Reimbursement model",                    variant:"",  fundingMethod:"Fully Insured",                               billingMethod:"Composite",               contributionMethod:"Voluntary",                         planType:"After-tax",      erisa:"No",  ndtApplicability:"No",                              notes:"" },
  { id:"bds_20", benefit:"FSA",               category:"Tax-Advantaged",    planDesign:"Health / LP / Dependent Care",           variant:"",  fundingMethod:"Self-Insured (Unfunded)",                     billingMethod:"",                        contributionMethod:"Contrib",                           planType:"Sec. 125",       erisa:"Yes", ndtApplicability:"Yes (125 + 105(h) for HFSA)",     notes:"" },
  { id:"bds_21", benefit:"HSA",               category:"Tax-Advantaged",    planDesign:"ER Funding / No ER Funding",             variant:"",  fundingMethod:"Trust/Custodial",                             billingMethod:"",                        contributionMethod:"Contrib",                           planType:"Sec. 223",       erisa:"No",  ndtApplicability:"Yes (comparability)",              notes:"Must be paired with HDHP" },
  { id:"bds_22", benefit:"HRA",               category:"Tax-Advantaged",    planDesign:"ICHRA / QSEHRA / Integrated",            variant:"",  fundingMethod:"Self-Insured",                                billingMethod:"",                        contributionMethod:"Non-Contrib",                       planType:"Sec. 105",       erisa:"Yes", ndtApplicability:"Yes (105(h))",                     notes:"" },
  { id:"bds_23", benefit:"Commuter",          category:"Tax-Advantaged",    planDesign:"Transit / Parking",                      variant:"",  fundingMethod:"Unfunded",                                    billingMethod:"",                        contributionMethod:"Contrib",                           planType:"Sec. 132(f)",    erisa:"No",  ndtApplicability:"No",                              notes:"" },
];

// ── BenefitsDbView ────────────────────────────────────────────────────────────
function BenefitsDbView({ benefitsDb, onSave, currentUser }) {
  const canEdit = ["Team Lead","VP","Lead","Account Executive"].includes(currentUser?.role?.trim());
  const canDelete = ["Team Lead","VP","Lead"].includes(currentUser?.role?.trim());
  const [activeCategory, setActiveCategory] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  // Seed default data if empty
  const records = (benefitsDb||[]).length > 0 ? benefitsDb : BENEFITS_DB_SEED;

  const filtered = records
    .filter(b => activeCategory === "All" || b.category === activeCategory)
    .sort((a,b) => {
      const ci = BENEFITS_DB_CATEGORIES.indexOf(a.category) - BENEFITS_DB_CATEGORIES.indexOf(b.category);
      return ci !== 0 ? ci : (a.variant||"").localeCompare(b.variant||"");
    });

  function startNew() {
    const id = "bd_" + Date.now();
    const newRow = { id, benefit:"", category: activeCategory === "All" ? "Core Health" : activeCategory,
      planDesign:"", variant:"", fundingMethod:"", billingMethod:"", contributionMethod:"",
      planType:"", erisa:"Yes", ndtApplicability:"No", notes:"" };
    const base = (benefitsDb||[]).length > 0 ? benefitsDb : BENEFITS_DB_SEED;
    onSave(() => [...base, newRow]);
    setEditingId(id);
    setEditData(newRow);
  }
  function startEdit(b) { setEditingId(b.id); setEditData(JSON.parse(JSON.stringify(b))); }
  function saveEdit() {
    if (!editData.category) return;
    const base = (benefitsDb||[]).length > 0 ? benefitsDb : BENEFITS_DB_SEED;
    onSave(() => {
      const exists = base.find(b => b.id === editData.id);
      return exists ? base.map(b => b.id === editData.id ? editData : b) : [...base, editData];
    });
    setEditingId(null); setEditData(null);
  }
  function deleteRecord(id) {
    if (!confirm("Delete this benefit record?")) return;
    const base = (benefitsDb||[]).length > 0 ? benefitsDb : BENEFITS_DB_SEED;
    onSave(() => base.filter(b => b.id !== id));
    if (editingId === id) { setEditingId(null); setEditData(null); }
  }
  function resetToDefaults() {
    if (!confirm("Reset the Benefits database to default data? Any custom entries will be replaced.")) return;
    onSave(() => BENEFITS_DB_SEED);
    setEditingId(null); setEditData(null);
  }

  const catCounts = {};
  records.forEach(b => { catCounts[b.category] = (catCounts[b.category]||0) + 1; });

  const COL_HEADERS = ["Benefit","Category","Plan Design","Variant","Funding Method","Billing Method","Contribution Method","Plan Type (Tax Code)","ERISA","NDT Applicability","Notes",""];
  const colWidths = "140px 180px 180px 180px 130px 180px 150px 55px 200px 1fr 70px";

  const thStyle = { fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: ".7px",
    textTransform: "uppercase", padding: "8px 10px", background: "#f1f5f9",
    borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap", userSelect: "none" };
  const tdStyle = { fontSize: 12, color: "#334155", padding: "8px 10px",
    borderBottom: "1px solid #f1f5f9", verticalAlign: "top", lineHeight: 1.4 };

  const catColors = {
    "Core Health":       { bg:"#dbeafe", text:"#1d4ed8" },
    "Life & AD&D":       { bg:"#f3e8ff", text:"#7e22ce" },
    "Income Protection": { bg:"#fce7f3", text:"#9d174d" },
    "Statutory Income":  { bg:"#fef3c7", text:"#92400e" },
    "Worksite":          { bg:"#dcfce7", text:"#166534" },
    "Wellness":          { bg:"#e0f2fe", text:"#0369a1" },
    "Lifestyle":         { bg:"#fde68a", text:"#78350f" },
    "Tax-Advantaged":    { bg:"#d1fae5", text:"#065f46" },
  };

  function DropdownCell({ field, value, options, onChange }) {
    return (
      <select value={value||""} onChange={e => onChange(e.target.value)}
        style={{ width:"100%", border:"1.5px solid #e2e8f0", borderRadius:6, padding:"4px 6px",
          fontSize:11, fontFamily:"inherit", background:"#fff", color:"#334155", cursor:"pointer" }}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',Georgia,serif", fontWeight:800, fontSize:20, color:"#0f172a" }}>Benefits</div>
          <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>Reference database of employee benefit types, structures, and regulatory attributes</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {canEdit && <button type="button" onClick={resetToDefaults}
            style={{ padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:700, fontFamily:"inherit",
              border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#64748b", cursor:"pointer" }}>
            ↺ Reset to Defaults
          </button>}
          {canEdit && <button type="button" onClick={startNew}
            style={{ background:"linear-gradient(135deg,#2d4a6b,#4a7fa5)", color:"#fff",
              border:"none", borderRadius:9, padding:"9px 20px", fontSize:13, fontWeight:700,
              cursor:"pointer", fontFamily:"inherit" }}>+ Add Row</button>}
        </div>
      </div>

      {/* Category filter tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {["All", ...BENEFITS_DB_CATEGORIES].map(cat => {
          const count = cat === "All" ? records.length : (catCounts[cat]||0);
          const cc = catColors[cat] || { bg:"#f1f5f9", text:"#475569" };
          const isActive = activeCategory === cat;
          return (
            <button key={cat} type="button" onClick={() => setActiveCategory(cat)} style={{
              padding:"5px 12px", borderRadius:8, fontSize:11, fontWeight:700, fontFamily:"inherit",
              cursor:"pointer", transition:"all .12s",
              border: isActive ? `1.5px solid ${cc.text}` : "1.5px solid #e2e8f0",
              background: isActive ? cc.bg : "#fff",
              color: isActive ? cc.text : "#64748b",
            }}>{cat} <span style={{ opacity:.7 }}>({count})</span></button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e2e8f0", overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:1200 }}>
            <thead>
              <tr>
                {COL_HEADERS.map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ ...tdStyle, textAlign:"center", padding:"40px", color:"#94a3b8" }}>
                  No records in this category
                </td></tr>
              )}
              {filtered.map((b, i) => {
                const isEditing = editingId === b.id;
                const cc = catColors[b.category] || { bg:"#f1f5f9", text:"#475569" };
                const rowBg = isEditing ? "#f0f5fa" : (i % 2 === 0 ? "#fff" : "#fafafa");
                return (
                  <tr key={b.id} style={{ background: rowBg, transition:"background .1s",
                      outline: isEditing ? "2px solid #4a7fa5" : "none", outlineOffset: -1 }}
                    onMouseEnter={e => !isEditing && (e.currentTarget.style.background="#f0f5fa")}
                    onMouseLeave={e => !isEditing && (e.currentTarget.style.background=rowBg)}>

                    {/* Benefit */}
                    <td style={{ ...tdStyle, fontWeight:700, color:"#0f172a" }}>
                      {isEditing ? (
                        <input value={editData.benefit||""} onChange={e=>setEditData(p=>({...p,benefit:e.target.value}))}
                          placeholder="e.g. Medical"
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff", boxSizing:"border-box" }} />
                      ) : b.benefit}
                    </td>

                    {/* Category */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.category||""} onChange={e=>setEditData(p=>({...p,category:e.target.value,planDesign:"",variant:""}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          {BENEFITS_DB_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:99,
                          background:cc.bg, color:cc.text, whiteSpace:"nowrap" }}>{b.category}</span>
                      )}
                    </td>

                    {/* Plan Design */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.planDesign||""} onChange={e=>setEditData(p=>({...p,planDesign:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {(BENEFITS_DB_OPTIONS.planDesign[editData.category]||[]).map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.planDesign}
                    </td>

                    {/* Variant */}
                    <td style={{ ...tdStyle, fontWeight: isEditing ? 400 : 600, color: isEditing ? "#334155" : "#1e3a5f" }}>
                      {isEditing ? (
                        <select value={editData.variant||""} onChange={e=>setEditData(p=>({...p,variant:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {(BENEFITS_DB_OPTIONS.variant[editData.category]||[]).map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.variant}
                    </td>

                    {/* Funding Method */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.fundingMethod||""} onChange={e=>setEditData(p=>({...p,fundingMethod:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {BENEFITS_DB_OPTIONS.fundingMethod.map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.fundingMethod}
                    </td>

                    {/* Billing Method */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.billingMethod||""} onChange={e=>setEditData(p=>({...p,billingMethod:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {BENEFITS_DB_OPTIONS.billingMethod.map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.billingMethod}
                    </td>

                    {/* Contribution Method */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.contributionMethod||""} onChange={e=>setEditData(p=>({...p,contributionMethod:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {BENEFITS_DB_OPTIONS.contributionMethod.map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.contributionMethod}
                    </td>

                    {/* Plan Type */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.planType||""} onChange={e=>setEditData(p=>({...p,planType:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {BENEFITS_DB_OPTIONS.planType.map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.planType ? (
                        <span style={{ fontSize:11, fontWeight:700, padding:"1px 7px", borderRadius:99,
                          background:"#fef3c7", color:"#92400e" }}>{b.planType}</span>
                      ) : null}
                    </td>

                    {/* ERISA */}
                    <td style={{ ...tdStyle, textAlign:"center" }}>
                      {isEditing ? (
                        <select value={editData.erisa||""} onChange={e=>setEditData(p=>({...p,erisa:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          {BENEFITS_DB_OPTIONS.erisa.map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize:11, fontWeight:800,
                          color: b.erisa==="Yes" ? "#166534" : "#991b1b" }}>{b.erisa}</span>
                      )}
                    </td>

                    {/* NDT */}
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select value={editData.ndtApplicability||""} onChange={e=>setEditData(p=>({...p,ndtApplicability:e.target.value}))}
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff" }}>
                          <option value="">— Select —</option>
                          {BENEFITS_DB_OPTIONS.ndtApplicability.map(o=><option key={o}>{o}</option>)}
                        </select>
                      ) : b.ndtApplicability ? (
                        <span style={{ fontSize:11,
                          color: b.ndtApplicability==="No" ? "#64748b" : "#7c2d12",
                          fontWeight: b.ndtApplicability==="No" ? 400 : 600 }}>{b.ndtApplicability}</span>
                      ) : null}
                    </td>

                    {/* Notes */}
                    <td style={{ ...tdStyle, fontSize:11 }}>
                      {isEditing ? (
                        <input value={editData.notes||""} onChange={e=>setEditData(p=>({...p,notes:e.target.value}))}
                          placeholder="Notes..."
                          style={{ width:"100%", border:"1.5px solid #93c5fd", borderRadius:6, padding:"4px 6px", fontSize:11, fontFamily:"inherit", background:"#fff", boxSizing:"border-box" }} />
                      ) : (
                        <span style={{ color:"#64748b", fontStyle: b.notes ? "normal" : "italic" }}>{b.notes || ""}</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ ...tdStyle, whiteSpace:"nowrap" }}>
                      <div style={{ display:"flex", gap:4 }}>
                        {canEdit && (
                          isEditing ? (
                            <>
                              <button type="button" onClick={saveEdit}
                                style={{ padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:700,
                                  border:"1.5px solid #4a7fa5", background:"#2d4a6b", color:"#fff",
                                  cursor:"pointer", fontFamily:"inherit" }}>Save</button>
                              <button type="button" onClick={()=>{setEditingId(null);setEditData(null);}}
                                style={{ padding:"3px 8px", borderRadius:6, fontSize:11, fontWeight:700,
                                  border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#475569",
                                  cursor:"pointer", fontFamily:"inherit" }}>✕</button>
                            </>
                          ) : (
                            <button type="button" onClick={() => startEdit(b)}
                              style={{ padding:"3px 10px", borderRadius:6, fontSize:11, fontWeight:700,
                                border:"1.5px solid #e2e8f0", background:"#f8fafc", color:"#475569",
                                cursor:"pointer", fontFamily:"inherit" }}>Edit</button>
                          )
                        )}
                        {canDelete && <button type="button" onClick={() => deleteRecord(b.id)}
                          style={{ padding:"3px 7px", borderRadius:6, fontSize:11, fontWeight:700,
                            border:"1.5px solid #fca5a5", background:"#fee2e2", color:"#991b1b",
                            cursor:"pointer", fontFamily:"inherit" }}>✕</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize:11, color:"#94a3b8", marginTop:8, textAlign:"right" }}>
        {filtered.length} record{filtered.length!==1?"s":""} shown
      </div>
    </div>
  );
}

// ── CarriersView ─────────────────────────────────────────────────────────────

function CarriersView({ carriers, onSave, currentUser }) {
  const isAC = currentUser?.role?.trim() === "Account Coordinator";
  const canDelete = ["Team Lead","VP","Lead"].includes(currentUser?.role?.trim());
  const canEditCarrier = !isAC;
  const [activeCategory, setActiveCategory] = useState("Medical");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  const filtered = carriers
    .filter(c => c.category === activeCategory)
    .sort((a, b) => a.name.localeCompare(b.name));

  function startEdit(carrier) {
    setEditingId(carrier.id);
    setEditData(JSON.parse(JSON.stringify(carrier)));
  }
  function startNew() {
    const newId = "c_" + Date.now();
    const blank = {
      id: newId, name: "", type: "National", category: activeCategory,
      segments: [], products: [], funding: [], states: [], notes: "", requirements: [],
      contacts: [],
      benefitDetails: "",
      planLimits: [],
      commissionRules: [],  // [{ benefit, segment, fundingMethod, type, amount, notes }]
    };
    setEditingId(newId);
    setEditData(blank);
  }
  function saveEdit() {
    if (!editData.name.trim()) return;
    onSave(prev => {
      const exists = prev.find(c => c.id === editData.id);
      return exists ? prev.map(c => c.id === editData.id ? editData : c) : [...prev, editData];
    });
    setEditingId(null);
    setEditData(null);
  }
  function deleteCarrier(id) {
    if (confirm("Delete this carrier?")) {
      onSave(prev => prev.filter(c => c.id !== id));
      if (editingId === id) { setEditingId(null); setEditData(null); }
    }
  }
  function togglePin(id) {
    onSave(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  }
  function toggleItem(field, val) {
    setEditData(p => ({
      ...p,
      [field]: p[field].includes(val) ? p[field].filter(x => x !== val) : [...p[field], val],
    }));
  }

  const allProducts = activeCategory === "Medical"
    ? PRODUCT_LIST.medical
    : activeCategory === "Ancillary"
    ? PRODUCT_LIST.ancillary
    : PRODUCT_LIST.admin;

  const CHIP = ({ label, active, onClick, color = "#4a7fa5" }) => (
    <button type="button" onClick={onClick} style={{
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: active ? 700 : 500,
      border: `1.5px solid ${active ? color : "#e2e8f0"}`,
      background: active ? (color === "#4a7fa5" ? "#dce8f0" : color === "#22c55e" ? "#dcfce7" : "#fef3c7") : "#fff",
      color: active ? (color === "#4a7fa5" ? "#2d4a6b" : color === "#22c55e" ? "#166534" : "#92400e") : "#64748b",
      cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
    }}>{label}</button>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
            Carrier Products
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Configure available products and eligibility rules per carrier</div>
        </div>
        {canEditCarrier && <button type="button" onClick={startNew} style={{
          background: "linear-gradient(135deg,#2d4a6b,#4a7fa5)", color: "#fff",
          border: "none", borderRadius: 9, padding: "9px 20px",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>+ Add Carrier</button>}
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {CARRIER_CATEGORIES.map(cat => (
          <button key={cat} type="button" onClick={() => { setActiveCategory(cat); setEditingId(null); }} style={{
            padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: `1.5px solid ${activeCategory === cat ? "#4a7fa5" : "#e2e8f0"}`,
            background: activeCategory === cat ? "#2d4a6b" : "#fff",
            color: activeCategory === cat ? "#fff" : "#64748b",
            cursor: "pointer", fontFamily: "inherit",
          }}>{cat}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 560px" : "1fr", gap: 16 }}>
        {/* Carrier list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff",
              borderRadius: 12, border: "1.5px dashed #e2e8f0", color: "#94a3b8" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontWeight: 700 }}>No {activeCategory} carriers yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Carrier" to get started</div>
            </div>
          )}
          {(() => {
            const pinnedCarriers   = filtered.filter(c => c.pinned);
            const unpinnedCarriers = filtered.filter(c => !c.pinned);
            const renderCarrier = carrier => {
              const isEditing = editingId === carrier.id;
              return (
              <div key={carrier.id} style={{
                background: isEditing ? "#f0f5fa" : "#fff",
                borderRadius: 12, padding: "14px 18px",
                border: `1.5px solid ${isEditing ? "#4a7fa5" : "#e2e8f0"}`,
                transition: "all .15s",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>{carrier.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                        background: carrier.type === "National" ? "#dce8f0" : "#e4ebdf",
                        color: carrier.type === "National" ? "#2d4a6b" : "#3a4a25" }}>{carrier.type}</span>
                      {carrier.segments.map(s => (
                        <span key={s} style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                          background: "#fef3c7", color: "#92400e" }}>{s}</span>
                      ))}
                    </div>
                    {carrier.products.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                        {carrier.products.map(p => (
                          <span key={p} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99,
                            background: "#f1f5f9", color: "#475569", fontWeight: 600 }}>{p}</span>
                        ))}
                      </div>
                    )}
                    {carrier.funding.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                        {carrier.funding.map(f => (
                          <span key={f} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99,
                            background: "#dcfce7", color: "#166534", fontWeight: 600 }}>{f}</span>
                        ))}
                      </div>
                    )}
                    {carrier.requirements?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        {carrier.requirements.map((r, i) => (
                          <span key={i} style={{ fontSize: 11, color: "#64748b" }}>
                            <strong style={{ color: "#475569" }}>{r.label}:</strong> {r.value}
                          </span>
                        ))}
                      </div>
                    )}
                    {carrier.benefitDetails && (
                      <div style={{ fontSize: 11, color: "#3a5a2a", marginTop: 4, fontStyle: "italic" }}>
                        📋 {carrier.benefitDetails}
                      </div>
                    )}
                    {(carrier.commissionRules || []).length > 0 && (
                      <div style={{ marginTop: 5 }}>
                        {(carrier.commissionRules || []).map((r, i) => (
                          <div key={i} style={{ marginBottom: 3 }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99,
                              background: r.type === "Graded" ? "#fef3c7" : "#dcfce7",
                              color: r.type === "Graded" ? "#92400e" : "#166534",
                              fontWeight: 600,
                              border: `1px solid ${r.type === "Graded" ? "#fde68a" : "#86efac"}` }}>
                              {r.benefit}{r.segment !== "All" ? ` (${r.segment})` : ""}{r.fundingMethod !== "All" ? ` / ${r.fundingMethod}` : ""}: {r.type === "PEPM" ? `$${r.amount} PEPM` : r.type === "Graded" ? `Graded (max ${r.amount}%)` : `${r.amount}%`}
                            </span>
                            {r.notes && (
                              <span style={{ fontSize: 10, color: "#64748b", marginLeft: 6, fontStyle: "italic" }}>{r.notes}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(carrier.planLimits || []).length > 0 && (
                      <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(carrier.planLimits || []).map((pl, i) => (
                          <span key={i} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99,
                            background: "#fef3c7", color: "#92400e", fontWeight: 600, border: "1px solid #fde68a" }}>
                            {pl.benefit}: max {pl.maxPlans} plan{pl.maxPlans !== "1" ? "s" : ""}{pl.condition ? ` (${pl.condition})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {(carrier.contacts || []).length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(carrier.contacts || []).slice(0, 4).map((ct, i) => (
                          <div key={i} style={{ fontSize: 10, padding: "5px 10px", borderRadius: 8,
                            background: "#e0f2fe", color: "#0369a1", border: "1px solid #bae6fd" }}>
                            <div style={{ fontWeight: 700 }}>👤 {ct.role}: {ct.name}</div>
                            {ct.email && <div style={{ opacity: 0.85, marginTop: 1 }}>✉️ {ct.email}</div>}
                            {ct.phone && <div style={{ opacity: 0.85, marginTop: 1 }}>📞 {ct.phone}</div>}
                            {ct.market && ct.market !== "Any" && <div style={{ opacity: 0.7, marginTop: 1, fontStyle: "italic" }}>{ct.market}</div>}
                          </div>
                        ))}
                        {(carrier.contacts || []).length > 4 && (
                          <span style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px" }}>+{(carrier.contacts||[]).length - 4} more</span>
                        )}
                      </div>
                    )}
                    {carrier.notes && (
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontStyle: "italic" }}>{carrier.notes}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={() => togglePin(carrier.id)}
                      title={carrier.pinned ? "Unpin" : "Pin to top"}
                      style={{ padding: "4px 8px", borderRadius: 6, fontSize: 13,
                        border: `1.5px solid ${carrier.pinned ? "#fcd34d" : "#e2e8f0"}`,
                        background: carrier.pinned ? "#fef9c3" : "#f8fafc",
                        cursor: "pointer", fontFamily: "inherit" }}>📌</button>
                    {canEditCarrier && <button type="button" onClick={() => isEditing ? (setEditingId(null), setEditData(null)) : startEdit(carrier)}
                      style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${isEditing ? "#4a7fa5" : "#e2e8f0"}`,
                        background: isEditing ? "#dce8f0" : "#f8fafc",
                        color: isEditing ? "#2d4a6b" : "#475569",
                        cursor: "pointer", fontFamily: "inherit" }}>{isEditing ? "Close" : "Edit"}</button>}
                    <button type="button" onClick={() => deleteCarrier(carrier.id)}
                      style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                        cursor: "pointer", fontFamily: "inherit",
                        display: canDelete ? "inline-block" : "none" }}>✕</button>
                  </div>
                </div>
              </div>
              );
            };
            return (
              <>
                {pinnedCarriers.length > 0 && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b",
                      letterSpacing: "1px", textTransform: "uppercase", padding: "2px 4px",
                      display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      Pinned
                    </div>
                    {pinnedCarriers.map(renderCarrier)}
                    {unpinnedCarriers.length > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                        letterSpacing: "1px", textTransform: "uppercase",
                        padding: "2px 4px", marginTop: 6, marginBottom: 4 }}>
                        A-Z
                      </div>
                    )}
                  </>
                )}
                {unpinnedCarriers.map(renderCarrier)}
              </>
            );
          })()}
        </div>

        {/* Edit panel */}
        {editingId && editData && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #4a7fa5",
            padding: "20px", position: "sticky", top: 80, alignSelf: "flex-start",
            maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#2d4a6b", marginBottom: 16 }}>
              {carriers.find(c => c.id === editingId) ? "Edit Carrier" : "New Carrier"}
            </div>

            <label style={labelStyle}>
              Carrier Name
              <input value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Aetna" style={{ ...inputStyle, marginTop: 3 }} />
            </label>

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Category
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {CARRIER_CATEGORIES.map(cat => (
                  <button key={cat} type="button"
                    onClick={() => setEditData(p => ({ ...p, category: cat }))}
                    style={{
                      padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      fontFamily: "inherit", cursor: "pointer", transition: "all .12s",
                      border: `2px solid ${editData.category === cat ? "#2d4a6b" : "#e2e8f0"}`,
                      background: editData.category === cat ? "#dce8f0" : "#fff",
                      color: editData.category === cat ? "#2d4a6b" : "#64748b",
                    }}>{cat}</button>
                ))}
              </div>
            </label>

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Type
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {CARRIER_TYPES.map(t => (
                  <CHIP key={t} label={t} active={editData.type === t}
                    onClick={() => setEditData(p => ({ ...p, type: t }))} />
                ))}
              </div>
            </label>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Market Segments</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {CARRIER_SEGMENTS.map(s => (
                  <CHIP key={s} label={s} active={editData.segments.includes(s)}
                    onClick={() => toggleItem("segments", s)} color="#f59e0b" />
                ))}
              </div>
            </div>

            {activeCategory !== "FSA/HSA/HRA Administrator" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Funding Methods</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {FUNDING_OPTIONS.map(f => (
                    <CHIP key={f} label={f} active={editData.funding.includes(f)}
                      onClick={() => toggleItem("funding", f)} color="#22c55e" />
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Products Offered</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {allProducts.map(p => (
                  <CHIP key={p} label={p} active={editData.products.includes(p)}
                    onClick={() => toggleItem("products", p)} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Minimum Requirements</div>
                <button type="button" onClick={() => setEditData(p => ({
                  ...p, requirements: [...(p.requirements || []), { label: "", value: "" }]
                }))} style={{ fontSize: 11, fontWeight: 700, color: "#2d4a6b", background: "#dce8f0",
                  border: "none", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit" }}>
                  + Add
                </button>
              </div>
              {(editData.requirements || []).map((req, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 5, marginBottom: 5 }}>
                  <input value={req.label} placeholder="Label (e.g. Min Eligible)"
                    onChange={e => { const r = [...editData.requirements]; r[ri] = { ...r[ri], label: e.target.value }; setEditData(p => ({ ...p, requirements: r })); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                  <input value={req.value} placeholder="Value (e.g. 25)"
                    onChange={e => { const r = [...editData.requirements]; r[ri] = { ...r[ri], value: e.target.value }; setEditData(p => ({ ...p, requirements: r })); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                  <button type="button" onClick={() => setEditData(p => ({ ...p, requirements: p.requirements.filter((_, i) => i !== ri) }))}
                    style={{ padding: "4px 7px", borderRadius: 6, fontSize: 11, border: "1.5px solid #fca5a5",
                      background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              ))}
            </div>

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Benefit Details / Coverage Offered
              <textarea value={editData.benefitDetails || ""} onChange={e => setEditData(p => ({ ...p, benefitDetails: e.target.value }))}
                placeholder="Plan types, networks, tier structures, special features..."
                rows={3} style={{ ...inputStyle, marginTop: 3, resize: "vertical", fontFamily: "inherit" }} />
            </label>

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Notes / Underwriting Caveats
              <textarea value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Special conditions, eligibility rules, caveats..."
                rows={3} style={{ ...inputStyle, marginTop: 3, resize: "vertical", fontFamily: "inherit" }} />
            </label>

            {/* ── Commission Rules ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Commission Rules</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>Default commission by benefit, segment, and funding method</div>
                </div>
                <button type="button" onClick={() => setEditData(p => ({
                  ...p,
                  commissionRules: [...(p.commissionRules || []), { benefit: "Medical", segment: "All", fundingMethod: "All", type: "Flat %", amount: "", notes: "" }],
                }))} style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "#dcfce7",
                  border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                  + Add Rule
                </button>
              </div>
              {(editData.commissionRules || []).length === 0 && (
                <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "6px 0" }}>
                  No commission rules defined
                </div>
              )}
              {(editData.commissionRules || []).map((rule, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 70px 80px 1fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  {/* Benefit */}
                  <select value={rule.benefit || "Medical"}
                    onChange={e => { const r=[...(editData.commissionRules||[])]; r[ri]={...r[ri],benefit:e.target.value}; setEditData(p=>({...p,commissionRules:r})); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 6px" }}>
                    {["Medical","Dental","Vision","Basic Life/AD&D","Vol Life","STD","LTD","IDI","Worksite","EAP","Telehealth","FSA","HSA","HRA","All"].map(b=><option key={b}>{b}</option>)}
                  </select>
                  {/* Segment */}
                  <select value={rule.segment || "All"}
                    onChange={e => { const r=[...(editData.commissionRules||[])]; r[ri]={...r[ri],segment:e.target.value}; setEditData(p=>({...p,commissionRules:r})); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 6px" }}>
                    {["All","ACA","Mid-Market","Large"].map(s=><option key={s}>{s}</option>)}
                  </select>
                  {/* Funding Method */}
                  <select value={rule.fundingMethod || "All"}
                    onChange={e => { const r=[...(editData.commissionRules||[])]; r[ri]={...r[ri],fundingMethod:e.target.value}; setEditData(p=>({...p,commissionRules:r})); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 6px" }}>
                    {["All","Fully Insured","Level-Funded","Self-Funded"].map(f=><option key={f}>{f}</option>)}
                  </select>
                  {/* Type */}
                  <select value={rule.type || "Flat %"}
                    onChange={e => { const r=[...(editData.commissionRules||[])]; r[ri]={...r[ri],type:e.target.value,amount:""}; setEditData(p=>({...p,commissionRules:r})); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 6px" }}>
                    {["Flat %","PEPM","Graded"].map(t=><option key={t}>{t}</option>)}
                  </select>
                  {/* Amount — for Graded, shows the starting/max rate */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {rule.type === "PEPM" && <span style={{ fontSize: 11, color: "#64748b", marginRight: 2, flexShrink: 0 }}>$</span>}
                    <input type="text" inputMode="numeric" value={rule.amount || ""}
                      onChange={e => { const r=[...(editData.commissionRules||[])]; r[ri]={...r[ri],amount:e.target.value.replace(/[^0-9.]/g,"")}; setEditData(p=>({...p,commissionRules:r})); }}
                      placeholder={rule.type === "Graded" ? "Max %" : "0"}
                      style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "4px 6px", textAlign: "right", fontWeight: 700 }} />
                    {rule.type !== "PEPM" && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 2, flexShrink: 0 }}>%</span>}
                  </div>
                  {/* Notes */}
                  <input type="text" value={rule.notes || ""}
                    onChange={e => { const r=[...(editData.commissionRules||[])]; r[ri]={...r[ri],notes:e.target.value}; setEditData(p=>({...p,commissionRules:r})); }}
                    placeholder="Notes (e.g. eff. 1/1/26, graded scale...)"
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                  {/* Remove */}
                  <button type="button" onClick={() => setEditData(p => ({ ...p, commissionRules: p.commissionRules.filter((_,i)=>i!==ri) }))}
                    style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, border: "1.5px solid #fca5a5",
                      background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              ))}
            </div>

            {/* ── Plan Limits ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Plan Limits</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 1 }}>Max # of plans allowed per benefit line</div>
                </div>
                <button type="button" onClick={() => setEditData(p => ({
                  ...p,
                  planLimits: [...(p.planLimits || []), { benefit: "Medical", maxPlans: "", condition: "" }],
                }))} style={{ fontSize: 11, fontWeight: 700, color: "#2d4a6b", background: "#dce8f0",
                  border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                  + Add Limit
                </button>
              </div>
              {(editData.planLimits || []).length === 0 && (
                <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "6px 0" }}>
                  No plan limits defined
                </div>
              )}
              {(editData.planLimits || []).map((pl, pli) => (
                <div key={pli} style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <select value={pl.benefit || "Medical"}
                    onChange={e => { const lims=[...(editData.planLimits||[])]; lims[pli]={...lims[pli],benefit:e.target.value}; setEditData(p=>({...p,planLimits:lims})); }}
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }}>
                    {["Medical","Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Worksite","FSA","HSA","HRA","EAP","Telehealth"].map(b => <option key={b}>{b}</option>)}
                  </select>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Max</span>
                    <input type="text" inputMode="numeric" value={pl.maxPlans || ""}
                      onChange={e => { const lims=[...(editData.planLimits||[])]; lims[pli]={...lims[pli],maxPlans:e.target.value.replace(/\D/g,"")}; setEditData(p=>({...p,planLimits:lims})); }}
                      placeholder="0"
                      style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "4px 6px", textAlign: "center", fontWeight: 700 }} />
                  </div>
                  <input type="text" value={pl.condition || ""}
                    onChange={e => { const lims=[...(editData.planLimits||[])]; lims[pli]={...lims[pli],condition:e.target.value}; setEditData(p=>({...p,planLimits:lims})); }}
                    placeholder="Condition (e.g. 5+ enrolled, ACA only...)"
                    style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                  <button type="button" onClick={() => setEditData(p => ({ ...p, planLimits: p.planLimits.filter((_,i)=>i!==pli) }))}
                    style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, border: "1.5px solid #fca5a5",
                      background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                </div>
              ))}
            </div>

            {/* ── Contacts ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Contacts</div>
                <button type="button" onClick={() => setEditData(p => ({
                  ...p,
                  contacts: [...(p.contacts || []), { role: "Sales Representative", name: "", email: "", phone: "", market: "Any", employerType: "Any", fundingType: "Any" }],
                }))} style={{ fontSize: 11, fontWeight: 700, color: "#2d4a6b", background: "#dce8f0",
                  border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                  + Add Contact
                </button>
              </div>
              {(editData.contacts || []).length === 0 && (
                <div style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>
                  No contacts yet — click "+ Add Contact" to add sales reps, service teams, etc.
                </div>
              )}
              {(editData.contacts || []).map((contact, ci) => (
                <div key={ci} style={{ background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", padding: "10px 12px", marginBottom: 8 }}>
                  {/* Row 1: Role + move buttons + ✕ */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <select value={contact.role || "Sales Representative"}
                      onChange={e => { const c = [...(editData.contacts||[])]; c[ci] = { ...c[ci], role: e.target.value }; setEditData(p => ({ ...p, contacts: c })); }}
                      style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }}>
                      {CARRIER_CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                    <button type="button" disabled={ci === 0}
                      onClick={() => {
                        const c = [...(editData.contacts||[])];
                        [c[ci-1], c[ci]] = [c[ci], c[ci-1]];
                        setEditData(p => ({ ...p, contacts: c }));
                      }}
                      style={{ padding: "4px 7px", borderRadius: 6, fontSize: 11, border: "1.5px solid #e2e8f0",
                        background: ci === 0 ? "#f8fafc" : "#fff", color: ci === 0 ? "#cbd5e1" : "#475569",
                        cursor: ci === 0 ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1 }}>↑</button>
                    <button type="button" disabled={ci === (editData.contacts||[]).length - 1}
                      onClick={() => {
                        const c = [...(editData.contacts||[])];
                        [c[ci], c[ci+1]] = [c[ci+1], c[ci]];
                        setEditData(p => ({ ...p, contacts: c }));
                      }}
                      style={{ padding: "4px 7px", borderRadius: 6, fontSize: 11, border: "1.5px solid #e2e8f0",
                        background: ci === (editData.contacts||[]).length - 1 ? "#f8fafc" : "#fff",
                        color: ci === (editData.contacts||[]).length - 1 ? "#cbd5e1" : "#475569",
                        cursor: ci === (editData.contacts||[]).length - 1 ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1 }}>↓</button>
                    <button type="button" onClick={() => setEditData(p => ({ ...p, contacts: p.contacts.filter((_, i) => i !== ci) }))}
                      style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, border: "1.5px solid #fca5a5",
                        background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>
                  {/* Row 2: Full Name (full width) */}
                  <input value={contact.name || ""} placeholder="Full Name"
                    onChange={e => { const c=[...(editData.contacts||[])]; c[ci]={...c[ci],name:e.target.value}; setEditData(p=>({...p,contacts:c})); }}
                    style={{ ...inputStyle, marginTop: 0, marginBottom: 6, fontSize: 11, padding: "4px 8px", width: "100%", boxSizing: "border-box" }} />
                  {/* Row 3: Email + Phone (side by side, phone below name) */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 3 }}>Email</div>
                      <input value={contact.email || ""} placeholder="email@carrier.com" type="email"
                        onChange={e => { const c=[...(editData.contacts||[])]; c[ci]={...c[ci],email:e.target.value}; setEditData(p=>({...p,contacts:c})); }}
                        style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 3 }}>Phone</div>
                      <input value={contact.phone || ""} placeholder="(312) 555-0000"
                        onChange={e => { const c=[...(editData.contacts||[])]; c[ci]={...c[ci],phone:formatPhone(e.target.value)}; setEditData(p=>({...p,contacts:c})); }}
                        style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                    </div>
                  </div>
                  {/* Row 4: Market / Employer / Funding */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Market Segment
                      <select value={contact.market || "Any"}
                        onChange={e => { const c=[...(editData.contacts||[])]; c[ci]={...c[ci],market:e.target.value}; setEditData(p=>({...p,contacts:c})); }}
                        style={{ ...inputStyle, marginTop: 2, fontSize: 11, padding: "3px 6px" }}>
                        <option>Any</option>
                        {CARRIER_SEGMENTS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Employer Type
                      <select value={contact.employerType || "Any"}
                        onChange={e => { const c=[...(editData.contacts||[])]; c[ci]={...c[ci],employerType:e.target.value}; setEditData(p=>({...p,contacts:c})); }}
                        style={{ ...inputStyle, marginTop: 2, fontSize: 11, padding: "3px 6px" }}>
                        {CARRIER_EMPLOYER_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>Funding Type
                      <select value={contact.fundingType || "Any"}
                        onChange={e => { const c=[...(editData.contacts||[])]; c[ci]={...c[ci],fundingType:e.target.value}; setEditData(p=>({...p,contacts:c})); }}
                        style={{ ...inputStyle, marginTop: 2, fontSize: 11, padding: "3px 6px" }}>
                        <option>Any</option>
                        {FUNDING_OPTIONS.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={saveEdit} style={{
                flex: 1, background: "linear-gradient(135deg,#2d4a6b,#4a7fa5)", color: "#fff",
                border: "none", borderRadius: 8, padding: "9px 0",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>Save Carrier</button>
              <button type="button" onClick={() => { setEditingId(null); setEditData(null); }} style={{
                background: "#f1f5f9", border: "none", borderRadius: 8, padding: "9px 16px",
                fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── TasksView ─────────────────────────────────────────────────────────────────

// ── Helpers for OpenTasksView (module-level so hooks can call them freely) ──

function isACAFilingExempt(c) {
  // ACA Filing not required for small employers (fewer than 50 FTEs) that are Fully Insured
  const isSmall = c.employerType === "Small" || c.marketSize === "ACA";
  const isFI = c.fundingMethod === "Fully Insured";
  return isSmall && isFI;
}

function collectOpenTasks(c, categoryFilter, tasksDb) {
  const items = [];
  const isOpen = t => {
    const s = typeof t === "object" ? (t.status || "Not Started") : (t || "Not Started");
    return s !== "Complete" && s !== "N/A";
  };
  const toObj = t => (typeof t === "object"
    ? { status: "Not Started", assignee: "", dueDate: "", ...t }
    : { status: t || "Not Started", assignee: "", dueDate: "" });

  const push = (label, category, raw, group, taskId, arrayIndex) => {
    if (categoryFilter && categoryFilter !== "All" && categoryFilter !== category) return;
    const t = toObj(raw);
    if (isOpen(t)) items.push({ label, category, group, taskId, arrayIndex, ...t });
  };

  // Pre-Renewal
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Pre-Renewal") {
    PRERENEWAL_TASKS.forEach(def => {
      if (def.acaOnly && c.marketSize !== "ACA") return;
      push(getLabelForTask(def.id, tasksDb, def.label), "Pre-Renewal", c.preRenewal?.[def.id], "preRenewal", def.id);
    });
  }
  // Renewal Tasks
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Renewal") {
    const rm = c.renewalMeeting;
    if (rm && typeof rm === "object") {
      push("Schedule Renewal Meeting", "Renewal", rm, "renewalMeeting", "renewalMeeting");
    }
    Object.entries(c.renewalTasksAuto || {}).forEach(([key, t]) => {
      const autoLabel = t.title || (
        key.startsWith("bps_") ? "Prepare and Submit BPS — " + key.replace("bps_","") :
        key.startsWith("pcr_") ? "Submit Plan Change Request — " + key.replace("pcr_","") :
        key.startsWith("ncp_") ? "New Carrier Paperwork — " + key.replace("ncp_","") :
        key.startsWith("tl_")  ? "Termination Letter — " + key.replace("tl_","") :
        key === "bpa_medical"   ? "Prepare and Submit BPA — Medical" : key
      );
      push(autoLabel, "Renewal", t, "renewalTasksAuto", key);
    });
    (c.renewalTasks || []).forEach((t, i) => push(t.title || "Unnamed", "Renewal", t, "renewalTasks", null, i));
  }
  // Open Enrollment
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Open Enrollment") {
    const oe = c.openEnrollment || {};
    OE_MATERIAL_TASKS.forEach(def => {
      const active =
        (def.material === "eguide"       && (oe.materials || {}).eguide) ||
        (def.material === "paper"        && (oe.materials || {}).paper)  ||
        (def.material === "memo"         && (oe.materials || {}).memo)   ||
        (def.material === "si_en"        && oe.enrollMethod === "si_en") ||
        (def.material === "si_ub"        && oe.enrollMethod === "si_ub") ||
        (def.material === "form"         && oe.enrollMethod === "form")  ||
        (def.material === "translation"  && oe.translationNeeded);
      if (active) push(getLabelForTask(def.id, tasksDb, def.label), "Open Enrollment", oe.tasks?.[def.id], "openEnrollment", def.id);
    });
  }
  // Post-OE
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Post-OE") {
    const hasCC = Object.values(c.benefitDecision || {}).some(v => v === "change_carrier");
    [
      { id: "elections_received",   label: "Elections Received?" },
      { id: "oe_changes_processed", label: "OE Changes Processed?" },
      ...(hasCC ? [{ id: "new_carrier_census", label: "New Carrier Submission Census Created?" }] : []),
      { id: "carrier_bill_audited", label: "Carrier Bill Audited?" },
      { id: "lineup_updated",       label: "Lineup Updated?" },
      { id: "oe_wrapup_email",      label: "OE Wrap-Up Email Sent?" },
    ].forEach(def => push(def.label, "Post-OE", (c.postOEFixed || {})[def.id], "postOEFixed", def.id));
    (c.postOETasks || []).forEach((t, i) => push(t.title || "Unnamed", "Post-OE", t, "postOETasks", null, i));
  }
  // Compliance
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Compliance") {
    COMPLIANCE_TASKS.forEach(def => {
      if (def.id === "aca_filing" && isACAFilingExempt(c)) return;
      push(getLabelForTask(def.id, tasksDb, def.label), "Compliance", c.compliance?.[def.id], "compliance", def.id);
    });
  }
  // Miscellaneous
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Miscellaneous" || categoryFilter === "Miscellaneous") {
    (c.miscTasks || []).forEach((t, i) => push(t.title || "Unnamed", "Miscellaneous", t, "miscTasks", null, i));
  }
  // Transactions
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Transactions") {
    (c.transactions || []).forEach((t, i) => {
      const title = t.memberName && t.changeType
        ? `${t.memberName} – ${t.changeType}`
        : t.memberName || t.changeType || t.label || "Unnamed Transaction";
      push(title, "Transactions", t, "transactions", null, i);
    });
  }
  // Ongoing
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Ongoing") {
    const medCarrierC  = (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || "";
    const medEnrolledC = Number((c.benefitEnrolled || {}).medical) || 0;
    const medPlansC    = (c.benefitPlans || {}).medical || [];
    const hasHMOC = medPlansC.some(p => p.type && p.type.toUpperCase().includes("HMO"));
    const hasPPOC = medPlansC.some(p => p.type && p.type.toUpperCase().includes("PPO"));
    Object.entries(c.ongoingTasks || {}).forEach(([taskId, t]) => {
      if (taskId === "__extra") return; // handled separately below
      if (!t || t.status === "N/A") return;
      const taskDef = (tasksDb || []).find(td => td.id === taskId);
      if (taskDef?.eligibilityRule === "blue_insights") {
        if (medEnrolledC < 50 || (!hasHMOC && !hasPPOC)) return;
      }
      push(taskDef?.label || taskId, "Ongoing", t, "ongoingTasks", taskId);
    });
    // Manual extra ongoing tasks
    ((c.ongoingTasks || {}).__extra || []).forEach((t, i) => {
      if (!t || t.status === "N/A") return;
      push(t.title || "Unnamed", "Ongoing", { ...t, dueDate: t.nextDue || "" }, "ongoingTasksExtra", null, i);
    });
  }
  return items;
}

// ── OpenTaskRow — stable component so edits don't collapse the panel ──────────────
function OpenTaskRow({ t, ti, c, taskKey, expandedTask, setExpandedTask, onUpdateTask, clients, teamMembers, today, statusChip, statusDot }) {
  const taskOpen = expandedTask === taskKey;
  const sc = statusChip[t.status] || statusChip["Not Started"];
  const dot = statusDot[t.status] || statusDot["Not Started"];
  const taskDate = t.dueDate ? new Date(t.dueDate + "T12:00:00") : null;
  const pastDue = taskDate && taskDate < today;

  // Local notes state so keystrokes don't trigger a save+re-render on every character
  const [localNotes, setLocalNotes] = React.useState(t.notes || "");
  // Sync if the task notes change externally (e.g. a different save path)
  React.useEffect(() => { setLocalNotes(t.notes || ""); }, [t.notes]);

  function updateTaskFields(fields) {
    if (!onUpdateTask) return;
    const client = clients.find(cl => cl.id === c.id);
    if (!client) return;
    let updated = JSON.parse(JSON.stringify(client));
    if (t.group === "compliance" || t.group === "preRenewal") {
      const existing = updated[t.group]?.[t.taskId];
      const base = (typeof existing === "object" && existing) ? existing : { status: "Not Started", assignee: "", dueDate: "", completedDate: "" };
      updated[t.group] = { ...updated[t.group], [t.taskId]: { ...base, ...fields } };
    } else if (t.group === "openEnrollment") {
      const existing = updated.openEnrollment?.tasks?.[t.taskId];
      const base = (typeof existing === "object" && existing) ? existing : { status: "Not Started", assignee: "", dueDate: "", completedDate: "" };
      updated.openEnrollment = { ...updated.openEnrollment, tasks: { ...(updated.openEnrollment?.tasks || {}), [t.taskId]: { ...base, ...fields } } };
    } else if (t.group === "postOETasks" || t.group === "miscTasks" || t.group === "renewalTasks") {
      const arr = [...(updated[t.group] || [])];
      arr[t.arrayIndex] = { ...arr[t.arrayIndex], ...fields };
      updated[t.group] = arr;
    } else if (t.group === "renewalMeeting") {
      updated.renewalMeeting = { ...(updated.renewalMeeting || {}), ...fields };
    } else if (t.group === "renewalTasksAuto") {
      updated.renewalTasksAuto = { ...(updated.renewalTasksAuto || {}), [t.taskId]: { ...(updated.renewalTasksAuto?.[t.taskId] || {}), ...fields } };
    } else if (t.group === "ongoingTasks") {
      updated.ongoingTasks = { ...(updated.ongoingTasks || {}), [t.taskId]: { ...(updated.ongoingTasks?.[t.taskId] || {}), ...fields } };
    } else if (t.group === "transactions") {
      const arr = [...(updated.transactions || [])];
      arr[t.arrayIndex] = { ...arr[t.arrayIndex], ...fields };
      updated.transactions = arr;
    }
    onUpdateTask(updated);
  }

  return (
    <div key={ti} style={{
      borderRadius: 7, overflow: "hidden",
      border: `1px solid ${pastDue ? "#fecdd3" : taskOpen ? "#bfdbfe" : "#e2e8f0"}`,
      background: taskOpen ? "#f8fbff" : pastDue ? "#fff1f2" : "#f8fafc",
    }}>
      {/* Summary row */}
      <div onClick={e => { e.stopPropagation(); setExpandedTask(taskOpen ? null : taskKey); }}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", userSelect: "none" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: pastDue ? "#f43f5e" : dot }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{t.label}</span>
        {t.assignee && !taskOpen && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#3e5878", background: "#e8f0f7", borderRadius: 99, padding: "1px 7px" }}>
            {t.assignee}
          </span>
        )}
        {t.dueDate && !taskOpen && (
          <span style={{ fontSize: 10, fontWeight: 600, color: pastDue ? "#e11d48" : "#64748b" }}>
            {pastDue ? "⚠ " : "📅 "}{formatDate(t.dueDate)}
          </span>
        )}
        <select
          value={t.status || "Not Started"}
          onClick={e => e.stopPropagation()}
          onChange={e => {
            const newStatus = e.target.value;
            updateTaskFields({ status: newStatus, ...(newStatus === "Complete" ? { completedDate: new Date().toISOString().split("T")[0] } : {}) });
          }}
          style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
            border: `1.5px solid ${sc.bg}`, background: sc.bg, color: sc.text,
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          <option value="Not Started">Not Started</option>
          <option value="In Progress">In Progress</option>
          <option value="Complete">Complete</option>
          <option value="N/A">N/A</option>
        </select>
        <span style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>{taskOpen ? "▲" : "▼"}</span>
      </div>

      {/* Expanded edit panel */}
      {taskOpen && (
        <div onClick={e => e.stopPropagation()}
          style={{ padding: "8px 12px 12px", borderTop: "1px solid #dbeafe",
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
            Assignee
            <select value={t.assignee || ""} onChange={e => updateTaskFields({ assignee: e.target.value })}
              style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }}>
              <option value="">— Unassigned —</option>
              {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
            Due Date
            <input type="date" value={t.dueDate || ""} onChange={e => updateTaskFields({ dueDate: e.target.value })}
              style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px",
                borderColor: pastDue ? "#fca5a5" : undefined }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
            Completed Date
            <input type="date" value={t.completedDate || ""}
              onChange={e => updateTaskFields({ completedDate: e.target.value, ...(e.target.value ? { status: "Complete" } : {}) })}
              style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
            Notes
            <input type="text"
              value={localNotes}
              onChange={e => setLocalNotes(e.target.value)}
              onBlur={e => { if (e.target.value !== (t.notes || "")) updateTaskFields({ notes: e.target.value }); }}
              placeholder="Notes…"
              style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
          </label>
        </div>
      )}
    </div>
  );
}

// ── OpenTasksView ─────────────────────────────────────────────────────────────

function OpenTasksView({ clients, onOpenClient, tasksDb, onUpdateTask, currentUser, userTeamId, userTeams, dashNav }) {
  const isRestricted = currentUser && !["Team Lead","VP","Lead"].includes(currentUser?.role?.trim()) && (userTeams||[]).length > 0;
  const [expandedTask, setExpandedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addForm, setAddForm] = useState({
    clientId: "", category: "Miscellaneous", title: "", assignee: "", dueDate: "", notes: "",
  });
  const [ovTeam,     setOvTeam]     = useState(isRestricted ? userTeamId : "All");
  const [ovMarket,   setOvMarket]   = useState("All");
  const [ovCarrier,  setOvCarrier]  = useState("All");
  const [ovSitus,    setOvSitus]    = useState("All");
  const [ovFunding,  setOvFunding]  = useState("All");
  const [ovCat,      setOvCat]      = useState("All");
  const [ovAssignee, setOvAssignee] = useState(dashNav?.assignee || "All");
  const [ovStatus,   setOvStatus]   = useState("All");
  const [ovSort,     setOvSort]     = useState("renewal");
  const [ovWindow,   setOvWindow]   = useState(dashNav?.window || "all");   // "all" | "30" | "60" | "90" | "120" | "overdue"
  const [expanded,   setExpanded]   = useState({});
  function toggleExpand(id) { setExpanded(p => ({ ...p, [id]: !p[id] })); }

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // Unique values for filter dropdowns
  const uniqueCarriers = useMemo(() =>
    [...new Set(clients.map(c => (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || "").filter(Boolean))].sort()
  , [clients]);
  const uniqueSitus = useMemo(() =>
    [...new Set(clients.map(c => c.groupSitus || "").filter(Boolean))].sort()
  , [clients]);
  const uniqueFunding = useMemo(() =>
    [...new Set(clients.map(c => c.fundingMethod || "").filter(Boolean))].sort()
  , [clients]);
  const uniqueAssignees = useMemo(() =>
    [...new Set(clients.flatMap(c => collectOpenTasks(c, null, tasksDb).map(t => t.assignee || "")).filter(Boolean))].sort()
  , [clients]);

  const clientRows = useMemo(() => {
    const teamRestrictedOT = isRestricted;
    return clients
      .filter(c => !teamRestrictedOT || (userTeams||[]).includes(c.team))
      .map(c => {
        const _days = daysUntil(c.renewalDate);
        // Window filter
        if (ovWindow === "overdue") { if (_days === null || _days >= 0) return null; }
        else if (ovWindow !== "all") {
          const n = Number(ovWindow);
          if (_days === null || _days < 0 || _days > n) return null;
        }
        // Client-level filters
        if (ovTeam    !== "All" && c.team !== ovTeam) return null;
        if (ovMarket  !== "All" && c.marketSize !== ovMarket) return null;
        if (ovFunding !== "All" && c.fundingMethod !== ovFunding) return null;
        if (ovSitus   !== "All" && (c.groupSitus || "") !== ovSitus) return null;
        if (ovCarrier !== "All") {
          const mc = (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || "";
          if (mc !== ovCarrier) return null;
        }
        // Collect tasks with category filter already applied
        let tasks = collectOpenTasks(c, ovCat !== "All" ? ovCat : null, tasksDb);
        if (ovAssignee !== "All") tasks = tasks.filter(t => (t.assignee || "") === ovAssignee);
        if (ovStatus   !== "All") tasks = tasks.filter(t => (t.status || "Not Started") === ovStatus);
        if (tasks.length === 0) return null;
        return { ...c, _openTasks: tasks, _days };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (ovSort === "open_count") return b._openTasks.length - a._openTasks.length;
        if (ovSort === "name") return (a.name || "").localeCompare(b.name || "");
        // renewal: overdue first (most negative), then soonest upcoming, no-date last
        const ad = a._days === null ? 99999 : a._days;
        const bd = b._days === null ? 99999 : b._days;
        return ad - bd;
      });
  }, [clients, ovWindow, ovTeam, ovMarket, ovCarrier, ovSitus, ovFunding, ovCat, ovAssignee, ovStatus, ovSort, currentUser, userTeamId]);

  const catColors = {
    "Pre-Renewal":     { bg: "#dce8f2", text: "#3e5878" },
    "Renewal":         { bg: "#d6e4f0", text: "#2d4a6b" },
    "Open Enrollment": { bg: "#dde7c7", text: "#54652d" },
    "Post-OE":         { bg: "#e8efd5", text: "#3d4f20" },
    "Compliance":      { bg: "#eef0e0", text: "#7a8a3d" },
    "Miscellaneous":   { bg: "#edf2f7", text: "#3e5878" },
    "Miscellaneous":   { bg: "#edf2f7", text: "#3e5878" },
    "Ongoing":         { bg: "#d8e6d0", text: "#54652d" },
    "Transactions":    { bg: "#fce7f3", text: "#9d174d" },  };
  const statusDot = { "Not Started": "#94a3b8", "In Progress": "#eab308" };
  const statusChip = {
    "Not Started": { bg: "#f1f5f9", text: "#64748b" },
    "In Progress":  { bg: "#fef9c3", text: "#854d0e" },
  };

  const activeFilters = [ovTeam,ovMarket,ovCarrier,ovSitus,ovFunding,ovCat,ovAssignee,ovStatus]
    .filter(v => v !== "All").length + (ovWindow !== "all" ? 1 : 0);

  const windowOptions = [
    { v: "all",     label: "All Clients" },
    { v: "overdue", label: "Overdue Only" },
    { v: "30",      label: "Next 30 Days" },
    { v: "60",      label: "Next 60 Days" },
    { v: "90",      label: "Next 90 Days" },
    { v: "120",     label: "Next 120 Days" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
            Open Tasks
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            {clientRows.length} client{clientRows.length !== 1 ? "s" : ""} · {clientRows.reduce((n,c) => n + c._openTasks.length, 0)} open task{clientRows.reduce((n,c) => n + c._openTasks.length, 0) !== 1 ? "s" : ""}
            {activeFilters > 0 && (
              <button onClick={() => {
                setOvTeam(isRestricted ? userTeamId : "All"); setOvMarket("All"); setOvCarrier("All"); setOvSitus("All");
                setOvFunding("All"); setOvCat("All"); setOvAssignee("All"); setOvStatus("All"); setOvWindow("all");
              }} style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, color: "#ef4444",
                background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>
        {/* Sort + Add Task */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {[["renewal","Renewal Date"],["open_count","Most Open"],["name","Name"]].map(([v,label]) => (
            <button key={v} type="button" onClick={() => setOvSort(v)} style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              border: `1.5px solid ${ovSort === v ? "#4a7fa5" : "#e2e8f0"}`,
              background: ovSort === v ? "#dce8f0" : "#fff",
              color: ovSort === v ? "#2d4a6b" : "#64748b",
              cursor: "pointer", fontFamily: "inherit",
            }}>Sort: {label}</button>
          ))}
          <button type="button" onClick={() => setShowAddTask(p => !p)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${showAddTask ? "#7c3aed" : "#4a7fa5"}`,
            background: showAddTask ? "#f3e8ff" : "linear-gradient(135deg,#3e5878,#507c9c)",
            color: showAddTask ? "#6d28d9" : "#fff",
            cursor: "pointer", fontFamily: "inherit",
          }}>+ Add Task</button>
        </div>
      </div>

      {/* Window filter pills */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {windowOptions.map(({ v, label }) => (
          <button key={v} type="button" onClick={() => setOvWindow(v)} style={{
            padding: "4px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${ovWindow === v ? (v === "overdue" ? "#fca5a5" : "#4a7fa5") : "#e2e8f0"}`,
            background: ovWindow === v ? (v === "overdue" ? "#fee2e2" : "#dce8f0") : "#fff",
            color: ovWindow === v ? (v === "overdue" ? "#991b1b" : "#2d4a6b") : "#64748b",
            cursor: "pointer", fontFamily: "inherit",
          }}>{label}</button>
        ))}
      </div>

      {/* Add Task Panel */}
      {showAddTask && (() => {
        const selClient = clients.find(c => c.id === Number(addForm.clientId) || c.id === addForm.clientId);
        const teamMembers = selClient
          ? (selClient.team === "India" ? INDIA_MEMBERS : JULIET_MEMBERS)
          : ALL_MEMBERS;
        const TASK_CATS = ["Miscellaneous", "Post-OE", "Pre-Renewal", "Compliance", "Open Enrollment"];

        function saveAddTask() {
          if (!addForm.clientId || !addForm.title.trim()) return;
          const client = clients.find(c => String(c.id) === String(addForm.clientId));
          if (!client) return;
          const updated = JSON.parse(JSON.stringify(client));
          const newTask = {
            id: "task_" + Date.now(),
            title: addForm.title.trim(),
            status: "Not Started",
            assignee: addForm.assignee,
            dueDate: addForm.dueDate,
            notes: addForm.notes,
            completedDate: "",
          };
          if (addForm.category === "Miscellaneous") {
            updated.miscTasks = [...(updated.miscTasks || []), newTask];
          } else if (addForm.category === "Post-OE") {
            updated.postOETasks = [...(updated.postOETasks || []), newTask];
          } else if (addForm.category === "Pre-Renewal") {
            updated.miscTasks = [...(updated.miscTasks || []), { ...newTask, _category: "Pre-Renewal" }];
          } else {
            updated.miscTasks = [...(updated.miscTasks || []), { ...newTask, _category: addForm.category }];
          }
          onUpdateTask(updated);
          setAddForm({ clientId: addForm.clientId, category: addForm.category, title: "", assignee: "", dueDate: "", notes: "" });
          setShowAddTask(false);
        }

        return (
          <div style={{ background: "#faf5ff", border: "1.5px solid #a78bfa", borderRadius: 12,
            padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#6d28d9", marginBottom: 14 }}>
              Add Task to Client Record
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
              {/* Client selector */}
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                Client *
                <select value={addForm.clientId}
                  onChange={e => setAddForm(p => ({ ...p, clientId: e.target.value, assignee: "" }))}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                  <option value="">— Select a client —</option>
                  {[...clients]
                    .filter(c => !isRestricted || c.team === userTeamId)
                    .sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              {/* Category */}
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                Category
                <select value={addForm.category}
                  onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                  {TASK_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              {/* Title */}
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                Task Title *
                <input type="text" value={addForm.title}
                  onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Send renewal summary to client"
                  onKeyDown={e => e.key === "Enter" && saveAddTask()}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
              </label>
              {/* Assignee */}
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                Assignee
                <select value={addForm.assignee}
                  onChange={e => setAddForm(p => ({ ...p, assignee: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                  <option value="">— Unassigned —</option>
                  {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              {/* Due Date */}
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                Due Date
                <input type="date" value={addForm.dueDate}
                  onChange={e => setAddForm(p => ({ ...p, dueDate: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
              </label>
            </div>
            {/* Notes */}
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
              Notes
              <input type="text" value={addForm.notes}
                onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes…"
                style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={saveAddTask}
                disabled={!addForm.clientId || !addForm.title.trim()}
                style={{ padding: "7px 20px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: (!addForm.clientId || !addForm.title.trim()) ? "#e2e8f0" : "linear-gradient(135deg,#6d28d9,#7c3aed)",
                  color: (!addForm.clientId || !addForm.title.trim()) ? "#94a3b8" : "#fff",
                  border: "none", cursor: (!addForm.clientId || !addForm.title.trim()) ? "default" : "pointer",
                  fontFamily: "inherit" }}>Save Task</button>
              <button type="button" onClick={() => { setShowAddTask(false); setAddForm({ clientId: "", category: "Miscellaneous", title: "", assignee: "", dueDate: "", notes: "" }); }}
                style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                  cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              {selClient && (
                <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center", marginLeft: 4 }}>
                  → will appear in {selClient.name}'s {addForm.category} tasks
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Filter row */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
        padding: "10px 14px", marginBottom: 16 }}>
        {/* Row 1: Client filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: "1px",
            textTransform: "uppercase", whiteSpace: "nowrap", minWidth: 48 }}>Client</span>
          {!isRestricted && (
            <select value={ovTeam} onChange={e => setOvTeam(e.target.value)}
              style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "4px 10px",
                background: ovTeam !== "All" ? "#dce8f0" : "#fff", flex: "1 1 120px", maxWidth: 160 }}>
              <option value="All">All Teams</option>
              {Object.entries(TEAMS).map(([key, t]) => (
                <option key={key} value={key}>Team {t.label}</option>
              ))}
            </select>
          )}
          {[
            { val: ovMarket,  set: setOvMarket,  opts: MARKET_SIZES,  placeholder: "All Markets" },
            { val: ovFunding, set: setOvFunding, opts: uniqueFunding,  placeholder: "All Funding" },
            { val: ovCarrier, set: setOvCarrier, opts: uniqueCarriers, placeholder: "All Carriers" },
            { val: ovSitus,   set: setOvSitus,   opts: uniqueSitus,    placeholder: "All Situs" },
          ].map(({ val, set, opts, placeholder }) => (
            <select key={placeholder} value={val} onChange={e => set(e.target.value)}
              style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "4px 10px",
                background: val !== "All" ? "#dce8f0" : "#fff", flex: "1 1 110px", maxWidth: 160 }}>
              <option value="All">{placeholder}</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
        </div>
        {/* Divider */}
        <div style={{ borderTop: "1px solid #e2e8f0", margin: "0 0 8px" }} />
        {/* Row 2: Task filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", letterSpacing: "1px",
            textTransform: "uppercase", whiteSpace: "nowrap", minWidth: 48 }}>Task</span>
          {[
            { val: ovCat,      set: setOvCat,      opts: ["Pre-Renewal","Renewal","Open Enrollment","Post-OE","Compliance","Miscellaneous","Ongoing"], placeholder: "All Categories" },
            { val: ovAssignee, set: setOvAssignee, opts: uniqueAssignees, placeholder: "All Assignees" },
            { val: ovStatus,   set: setOvStatus,   opts: ["Not Started","In Progress"], placeholder: "All Statuses" },
          ].map(({ val, set, opts, placeholder }) => (
            <select key={placeholder} value={val} onChange={e => set(e.target.value)}
              style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "4px 10px",
                background: val !== "All" ? "#dce8f0" : "#fff", flex: "1 1 140px", maxWidth: 200 }}>
              <option value="All">{placeholder}</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
        </div>
      </div>

      {/* Client cards */}
      {clientRows.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0",
          padding: "56px 20px", textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#64748b" }}>No open tasks found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>All tasks are complete or N/A for the current filters</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {clientRows.map(c => {
            const team = TEAMS[c.team];
            const badge = renewalBadge(c.renewalDate);
            const isOverdue = c._days !== null && c._days < 0;
            const isOpen = expanded[c.id] !== false; // default expanded
            const byCategory = {};
            c._openTasks.forEach(t => {
              if (!byCategory[t.category]) byCategory[t.category] = [];
              byCategory[t.category].push(t);
            });
            return (
              <div key={c.id} style={{
                background: "#fff", borderRadius: 12,
                border: `1.5px solid ${isOverdue ? "#fca5a5" : "#e2e8f0"}`,
                overflow: "hidden",
              }}>
                {/* Client header row */}
                <div onClick={() => toggleExpand(c.id)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: isOverdue ? "#fff9f9" : "#f8fafc",
                  cursor: "pointer", userSelect: "none",
                  borderBottom: isOpen ? `1px solid ${isOverdue ? "#fee2e2" : "#e2e8f0"}` : "none",
                }}>
                  {/* Renewal countdown badge */}
                  <div style={{ minWidth: 50, textAlign: "center", borderRadius: 8, padding: "4px 2px",
                    background: isOverdue ? "#fee2e2" : (badge ? badge.bg : "#f1f5f9") }}>
                    <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1,
                      color: isOverdue ? "#991b1b" : (badge ? badge.text : "#64748b") }}>
                      {c._days === null ? "—" : Math.abs(c._days)}
                    </div>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".5px",
                      color: isOverdue ? "#b91c1c" : (badge ? badge.text : "#94a3b8") }}>
                      {isOverdue ? "PAST DUE" : "DAYS"}
                    </div>
                  </div>
                  {/* Name + renewal date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                      {c.renewalDate ? (isOverdue ? `Was ${formatDate(c.renewalDate)}` : `Renews ${formatDate(c.renewalDate)}`) : "No renewal date"}
                    </div>
                  </div>
                  {/* Tags */}
                  <div style={{ display: "flex", gap: 5, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
                    {team && <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                      background: team.color, color: team.text }}>{team.label}</span>}
                    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                      background: "#f1f5f9", color: "#475569" }}>{c.marketSize}</span>
                    {(() => {
                      const mc = (c.benefitCarriers || {}).medical || (c.carriers || [])[0];
                      return mc ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10,
                        fontWeight: 600, background: "#f0fdf4", color: "#166534" }}>{mc}</span> : null;
                    })()}
                    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 800,
                      background: isOverdue ? "#fee2e2" : "#fef3c7",
                      color: isOverdue ? "#991b1b" : "#92400e" }}>
                      {c._openTasks.length} open
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onOpenClient(c); }} style={{
                    padding: "4px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700,
                    border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8",
                    cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                  }}>Open →</button>
                  <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: 4, flexShrink: 0 }}>
                    {isOpen ? "▲" : "▼"}
                  </span>
                </div>

                {/* Task list */}
                {isOpen && (
                  <div style={{ padding: "10px 16px 14px" }}>
                    {Object.entries(byCategory).map(([cat, tasks]) => {
                      const cc = catColors[cat] || catColors["Miscellaneous"];
                      return (
                        <div key={cat} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px",
                            textTransform: "uppercase", color: cc.text, marginBottom: 5 }}>{cat}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {tasks.map((t, ti) => {
                              const taskKey  = `${c.id}__${t.group}__${t.taskId || t.arrayIndex}__${ti}`;
                              const teamMembers = c.team === "India" ? INDIA_MEMBERS : JULIET_MEMBERS;
                              return (
                                <OpenTaskRow key={taskKey} t={t} ti={ti} c={c} taskKey={taskKey}
                                  expandedTask={expandedTask} setExpandedTask={setExpandedTask}
                                  onUpdateTask={onUpdateTask} clients={clients}
                                  teamMembers={teamMembers} today={today}
                                  statusChip={statusChip} statusDot={statusDot} />
                              );
                            })}

                          </div>
                        </div>
                      );
                    })}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TasksView({ tasks, onSave, dueDateRules, onSaveDueDateRules, currentUser }) {
  const canEdit   = ["Team Lead","VP","Lead"].includes(currentUser?.role?.trim());
  const canDelete = canEdit;
  const [activeCategory, setActiveCategory] = useState("Compliance");
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [showDDR, setShowDDR] = useState(false);
  const [ddrEditing, setDdrEditing] = useState(null); // id of rule being edited
  const [ddrForm, setDdrForm] = useState(null);       // { id, label, anchor, direction, days }

  const filtered = tasks
    .filter(t => t.category === activeCategory)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  function startEdit(task) {
    setEditingId(task.id);
    setEditData(JSON.parse(JSON.stringify(task)));
  }

  function startNew() {
    const newId = "t_" + Date.now();
    const maxOrder = filtered.reduce((m, t) => Math.max(m, t.order || 0), 0);
    const blank = {
      id: newId, label: "", category: activeCategory,
      markets: ["ACA","Mid-Market","Large"],
      defaultAssignee: "", dueDateRule: "", order: maxOrder + 10,
    };
    setEditingId(newId);
    setEditData(blank);
  }

  function saveEdit() {
    if (!editData.label.trim()) return;
    onSave(prev => {
      const exists = prev.find(t => t.id === editData.id);
      return exists ? prev.map(t => t.id === editData.id ? editData : t) : [...prev, editData];
    });
    setEditingId(null);
    setEditData(null);
  }

  function deleteTask(id) {
    if (confirm("Delete this task?")) {
      onSave(prev => prev.filter(t => t.id !== id));
      if (editingId === id) { setEditingId(null); setEditData(null); }
    }
  }

  function moveTask(id, dir) {
    onSave(prev => {
      const cat = prev.filter(t => t.category === activeCategory).sort((a,b) => (a.order||0)-(b.order||0));
      const idx = cat.findIndex(t => t.id === id);
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= cat.length) return prev;
      const a = cat[idx], b = cat[swapIdx];
      const ao = a.order || 0, bo = b.order || 0;
      return prev.map(t => {
        if (t.id === a.id) return { ...t, order: bo };
        if (t.id === b.id) return { ...t, order: ao };
        return t;
      });
    });
  }

  function toggleMarket(market) {
    const cur = editData.markets || [];
    setEditData(p => ({
      ...p, markets: cur.includes(market) ? cur.filter(m => m !== market) : [...cur, market],
    }));
  }
  function toggleCarrier(carrier) {
    const cur = editData.carriers || [];
    setEditData(p => ({
      ...p, carriers: cur.includes(carrier) ? cur.filter(c => c !== carrier) : [...cur, carrier],
    }));
  }
  function toggleFunding(f) {
    const cur = editData.funding || [];
    setEditData(p => ({
      ...p, funding: cur.includes(f) ? cur.filter(x => x !== f) : [...cur, f],
    }));
  }
  function toggleState(s) {
    const cur = editData.states || [];
    setEditData(p => ({
      ...p, states: cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s],
    }));
  }

  const CHIP = ({ label, active, onClick, color = "#4a7fa5" }) => (
    <button type="button" onClick={onClick} style={{
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: active ? 700 : 500,
      border: `1.5px solid ${active ? color : "#e2e8f0"}`,
      background: active ? "#dce8f0" : "#fff",
      color: active ? "#2d4a6b" : "#64748b",
      cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
    }}>{label}</button>
  );

  const categoryColors = {
    "Pre-Renewal":     { bg: "#dce8f2", text: "#3e5878", border: "#507c9c" },
    "Renewal":         { bg: "#d6e4f0", text: "#2d4a6b", border: "#3e5878" },
    "Open Enrollment": { bg: "#dde7c7", text: "#54652d", border: "#7a8a3d" },
    "Post-OE":         { bg: "#e8efd5", text: "#3d4f20", border: "#54652d" },
    "Compliance":      { bg: "#eef0e0", text: "#7a8a3d", border: "#7a8a3d" },
    "Miscellaneous":   { bg: "#edf2f7", text: "#3e5878", border: "#507c9c" },
    "Miscellaneous":   { bg: "#edf2f7", text: "#3e5878", border: "#507c9c" },
    "Ongoing":         { bg: "#d8e6d0", text: "#54652d", border: "#7a8a3d" },
    "Transactions":    { bg: "#fce7f3", text: "#9d174d", border: "#f472b6" },
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
            Task Templates
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Define default tasks, assignees, and due-date rules applied to clients
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {canEdit && activeCategory !== "Compliance" && (<>
          <button type="button" onClick={() => {
            if (confirm("Reset all tasks to built-in defaults? Your customizations will be lost.")) {
              onSave(DEFAULT_TASKS_DATA);
              setEditingId(null); setEditData(null);
            }
          }} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#64748b",
            cursor: "pointer", fontFamily: "inherit" }}>↺ Reset Defaults</button>
          <button type="button" onClick={startNew} style={{
            background: "linear-gradient(135deg,#3e5878,#507c9c)", color: "#fff",
            border: "none", borderRadius: 9, padding: "9px 20px",
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}>+ Add Task</button>
          </>)}
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TASK_CATEGORIES_DB.map(cat => {
          const cc = categoryColors[cat] || categoryColors["Miscellaneous"];
          const active = activeCategory === cat;
          return (
            <button key={cat} type="button" onClick={() => { setActiveCategory(cat); setEditingId(null); }} style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: `1.5px solid ${active ? cc.border : "#e2e8f0"}`,
              background: active ? cc.bg : "#fff",
              color: active ? cc.text : "#64748b",
              cursor: "pointer", fontFamily: "inherit",
            }}>
              {cat}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                ({tasks.filter(t => t.category === cat).length})
              </span>
            </button>
          );
        })}
        {/* Due Date Rules tab — hidden for ACs */}
        {canEdit && <button type="button" onClick={() => { setShowDDR(s => !s); setEditingId(null); }} style={{
          padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700,
          border: `1.5px solid ${showDDR ? "#7c3aed" : "#e2e8f0"}`,
          background: showDDR ? "#f3e8ff" : "#fff",
          color: showDDR ? "#6d28d9" : "#64748b",
          cursor: "pointer", fontFamily: "inherit",
        }}>
          📅 Due Date Rules
          <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
            ({(dueDateRules || []).length})
          </span>
        </button>}
      </div>

      {/* Due Date Rules management panel */}
      {showDDR && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#6d28d9" }}>Due Date Rules</div>
            {canEdit && <button type="button" onClick={() => {
              const newId = "ddr_" + Date.now();
              setDdrEditing(newId);
              setDdrForm({ id: newId, label: "", anchor: "renewal", direction: "before", days: 30, builtin: false });
            }} style={{
              background: "linear-gradient(135deg,#6d28d9,#7c3aed)", color: "#fff",
              border: "none", borderRadius: 8, padding: "7px 16px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>+ New Rule</button>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* New rule form — shown when creating a brand-new rule not yet in the list */}
            {ddrEditing && !(dueDateRules || []).find(r => r.id === ddrEditing) && ddrForm && (
              <div style={{ background: "#faf5ff", borderRadius: 10, padding: "12px 16px",
                border: "1.5px solid #a78bfa" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6d28d9", marginBottom: 10 }}>New Rule</div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                    Rule Label
                    <input type="text" value={ddrForm.label}
                      onChange={e => setDdrForm(p => ({ ...p, label: e.target.value }))}
                      placeholder="e.g. 30 days after receipt of renewal"
                      style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                    Anchor Event
                    <select value={ddrForm.anchor}
                      onChange={e => setDdrForm(p => ({ ...p, anchor: e.target.value }))}
                      style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                      {DDR_ANCHORS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                    Direction
                    <select value={ddrForm.direction}
                      onChange={e => setDdrForm(p => ({ ...p, direction: e.target.value }))}
                      style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                      <option value="before">Before</option>
                      <option value="after">After</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                    Days
                    <input type="number" min="0" value={ddrForm.days || ""}
                      onChange={e => setDdrForm(p => ({ ...p, days: Number(e.target.value) }))}
                      placeholder="0"
                      style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => {
                    if (!ddrForm.label.trim()) return;
                    onSaveDueDateRules(prev => [...prev, { ...ddrForm }]);
                    setDdrEditing(null); setDdrForm(null);
                  }} style={{ padding: "6px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                    background: "linear-gradient(135deg,#6d28d9,#7c3aed)", color: "#fff",
                    border: "none", cursor: "pointer", fontFamily: "inherit" }}>Save Rule</button>
                  <button type="button" onClick={() => { setDdrEditing(null); setDdrForm(null); }}
                    style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                      border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                      cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              </div>
            )}
            {(dueDateRules || []).map(rule => {
              const isEditing = ddrEditing === rule.id;
              const form = isEditing ? ddrForm : rule;
              return (
                <div key={rule.id} style={{
                  background: isEditing ? "#faf5ff" : "#fff", borderRadius: 10, padding: "12px 16px",
                  border: `1.5px solid ${isEditing ? "#a78bfa" : rule.builtin ? "#e9d5ff" : "#e2e8f0"}`,
                }}>
                  {!isEditing ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{rule.label}</span>
                        {rule.builtin && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "1px 6px",
                            borderRadius: 99, background: "#f3e8ff", color: "#7c3aed" }}>Built-in</span>
                        )}
                        {!rule.builtin && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            {rule.days} days {rule.direction} {DDR_ANCHORS.find(a => a.id === rule.anchor)?.label || rule.anchor}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {canEdit && !rule.builtin && (
                          <>
                            <button type="button" onClick={() => { setDdrEditing(rule.id); setDdrForm({ ...rule }); }}
                              style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#475569",
                                cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                            <button type="button" onClick={() => {
                              if (confirm("Delete this rule?")) onSaveDueDateRules(prev => prev.filter(r => r.id !== rule.id));
                            }} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                              border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                              cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6d28d9", marginBottom: 10 }}>
                        {rule.id.startsWith("ddr_") ? "New Rule" : `Editing: ${rule.label}`}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                          Rule Label
                          <input type="text" value={form.label}
                            onChange={e => setDdrForm(p => ({ ...p, label: e.target.value }))}
                            placeholder="e.g. 30 days after receipt of renewal"
                            style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                          Anchor Event
                          <select value={form.anchor}
                            onChange={e => setDdrForm(p => ({ ...p, anchor: e.target.value }))}
                            style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                            {DDR_ANCHORS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                          </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                          Direction
                          <select value={form.direction}
                            onChange={e => setDdrForm(p => ({ ...p, direction: e.target.value }))}
                            style={{ ...inputStyle, marginTop: 0, fontSize: 12 }}>
                            <option value="before">Before</option>
                            <option value="after">After</option>
                          </select>
                        </label>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                          Days
                          <input type="number" min="0" value={form.days || ""}
                            onChange={e => setDdrForm(p => ({ ...p, days: Number(e.target.value) }))}
                            placeholder="0"
                            style={{ ...inputStyle, marginTop: 0, fontSize: 12 }} />
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => {
                          if (!ddrForm.label.trim()) return;
                          // Auto-generate label if blank or matches default pattern
                          const autoLabel = ddrForm.label.trim() || `${ddrForm.days} days ${ddrForm.direction} ${DDR_ANCHORS.find(a => a.id === ddrForm.anchor)?.label}`;
                          const finalRule = { ...ddrForm, label: autoLabel };
                          onSaveDueDateRules(prev => {
                            const exists = prev.find(r => r.id === finalRule.id);
                            return exists ? prev.map(r => r.id === finalRule.id ? finalRule : r) : [...prev, finalRule];
                          });
                          setDdrEditing(null);
                          setDdrForm(null);
                        }} style={{ padding: "6px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                          background: "linear-gradient(135deg,#6d28d9,#7c3aed)", color: "#fff",
                          border: "none", cursor: "pointer", fontFamily: "inherit" }}>Save Rule</button>
                        <button type="button" onClick={() => { setDdrEditing(null); setDdrForm(null); }}
                          style={{ padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700,
                            border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                            cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 380px" : "1fr", gap: 16 }}>
        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff",
              borderRadius: 12, border: "1.5px dashed #e2e8f0", color: "#94a3b8" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700 }}>No {activeCategory} tasks yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click "+ Add Task" to get started</div>
            </div>
          )}
          {filtered.map((task, idx) => {
            const isEditing = editingId === task.id;
            const cc = categoryColors[task.category] || categoryColors["Miscellaneous"];
            const ruleLabel = (dueDateRules || DUE_DATE_RULES).find(r => r.id === task.dueDateRule)?.label || "Manual";
            return (
              <div key={task.id} style={{
                background: isEditing ? "#f0f5fa" : "#fff",
                borderRadius: 12, padding: "13px 16px",
                border: `1.5px solid ${isEditing ? "#4a7fa5" : "#e2e8f0"}`,
                transition: "all .15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Reorder buttons */}
                  {canEdit && activeCategory !== "Compliance" && <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <button type="button" onClick={() => moveTask(task.id, -1)} disabled={idx === 0}
                      style={{ padding: "1px 5px", fontSize: 10, border: "1px solid #e2e8f0",
                        borderRadius: 4, background: "#f8fafc", color: "#94a3b8", cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.3 : 1, fontFamily: "inherit" }}>▲</button>
                    <button type="button" onClick={() => moveTask(task.id, 1)} disabled={idx === filtered.length - 1}
                      style={{ padding: "1px 5px", fontSize: 10, border: "1px solid #e2e8f0",
                        borderRadius: 4, background: "#f8fafc", color: "#94a3b8",
                        cursor: idx === filtered.length - 1 ? "default" : "pointer",
                        opacity: idx === filtered.length - 1 ? 0.3 : 1, fontFamily: "inherit" }}>▼</button>
                  </div>}

                  {/* Task info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{task.label}</span>
                      {task.defaultAssignee && (
                        <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 99,
                          background: "#f0f5fa", color: "#3e5878", fontWeight: 600 }}>
                          👤 {task.defaultAssignee}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                      {(task.markets || []).map(m => (
                        <span key={m} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99,
                          background: cc.bg, color: cc.text, fontWeight: 700 }}>{m}</span>
                      ))}
                      {task.dueDateRule && (
                        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99,
                          background: "#f1f5f9", color: "#475569", fontWeight: 600 }}>
                          📅 {ruleLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {(canEdit && activeCategory !== "Compliance") ? (
                      <>
                        <button type="button" onClick={() => isEditing ? (setEditingId(null), setEditData(null)) : startEdit(task)}
                          style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: `1.5px solid ${isEditing ? "#4a7fa5" : "#e2e8f0"}`,
                            background: isEditing ? "#dce8f0" : "#f8fafc",
                            color: isEditing ? "#2d4a6b" : "#475569",
                            cursor: "pointer", fontFamily: "inherit" }}>{isEditing ? "Close" : "Edit"}</button>
                        <button type="button" onClick={() => deleteTask(task.id)}
                          style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                            border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                            cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Edit panel */}
        {editingId && editData && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #4a7fa5",
            padding: "20px", position: "sticky", top: 80, alignSelf: "flex-start",
            maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#2d4a6b", marginBottom: 16 }}>
              {tasks.find(t => t.id === editingId) && tasks.find(t => t.id === editingId).label
                ? "Edit Task" : "New Task"}
            </div>

            <label style={labelStyle}>
              Task Label
              <input value={editData.label} onChange={e => setEditData(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Renewal Download" style={{ ...inputStyle, marginTop: 3 }} />
            </label>

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Category
              <select value={editData.category}
                onChange={e => setEditData(p => ({ ...p, category: e.target.value }))}
                style={{ ...inputStyle, marginTop: 3 }}>
                {TASK_CATEGORIES_DB.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            {/* Standard Task toggle */}
            <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 9,
              background: editData.isStandard ? "#eff6ff" : "#f8fafc",
              border: `1.5px solid ${editData.isStandard ? "#93c5fd" : "#e2e8f0"}` }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={!!editData.isStandard}
                  onChange={e => setEditData(p => ({ ...p, isStandard: e.target.checked }))}
                  style={{ accentColor: "#3b82f6", width: 16, height: 16, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: editData.isStandard ? "#1d4ed8" : "#475569" }}>
                    Standard Task
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                    Auto-assign to all matching clients based on market, funding, and carrier filters below
                  </div>
                </div>
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Applies to Markets</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {MARKET_SIZES.map(m => (
                  <CHIP key={m} label={m} active={(editData.markets || []).includes(m)}
                    onClick={() => toggleMarket(m)} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Applies to Carriers</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5, fontStyle: "italic" }}>
                Leave blank to apply to all carriers
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 96, overflowY: "auto" }}>
                {CARRIERS.map(c => (
                  <CHIP key={c} label={c} active={(editData.carriers || []).includes(c)}
                    onClick={() => toggleCarrier(c)} color="#22c55e" />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Applies to Funding Methods</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5, fontStyle: "italic" }}>
                Leave blank to apply to all funding methods
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {FUNDING_METHODS.map(f => (
                  <CHIP key={f} label={f} active={(editData.funding || []).includes(f)}
                    onClick={() => toggleFunding(f)} color="#f59e0b" />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Applies to States (Situs)</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 5, fontStyle: "italic" }}>
                Leave blank to apply to all states
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 80, overflowY: "auto" }}>
                {STATE_ABBREVS.map(s => (
                  <CHIP key={s} label={s} active={(editData.states || []).includes(s)}
                    onClick={() => toggleState(s)} color="#a855f7" />
                ))}
              </div>
            </div>

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Default Assignee Role
              <select value={editData.defaultAssignee || ""}
                onChange={e => setEditData(p => ({ ...p, defaultAssignee: e.target.value }))}
                style={{ ...inputStyle, marginTop: 3 }}>
                <option value="">— None / Unassigned —</option>
                {TASK_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            {editData.defaultAssignee && (
              <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 7,
                background: "#f0f5fa", border: "1px solid #dce8f0", fontSize: 11, color: "#3e5878" }}>
                <span style={{ fontWeight: 700 }}>Resolves to: </span>
                {Object.entries(TEAMS).map(([id, t]) => {
                  const name = resolveAssignee(editData.defaultAssignee, id);
                  return name ? <span key={id} style={{ marginRight: 10 }}>
                    <span style={{ fontWeight: 600 }}>{t.label}:</span> {name}
                  </span> : null;
                })}
              </div>
            )}

            {editData.category === "Ongoing" ? (
              <label style={{ ...labelStyle, marginTop: 12 }}>
                Recurrence
                <select value={editData.recurrence || "Monthly"}
                  onChange={e => setEditData(p => ({ ...p, recurrence: e.target.value }))}
                  style={{ ...inputStyle, marginTop: 3 }}>
                  {RECURRENCE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            ) : (
            <label style={{ ...labelStyle, marginTop: 12 }}>
              Due Date Rule
              <select value={editData.dueDateRule || ""}
                onChange={e => setEditData(p => ({ ...p, dueDateRule: e.target.value }))}
                style={{ ...inputStyle, marginTop: 3 }}>
                <option value="">None / Manual</option>
                {(dueDateRules || DEFAULT_DUE_DATE_RULES).map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            )}

            <label style={{ ...labelStyle, marginTop: 12 }}>
              Sort Order #
              <input type="number" value={editData.order || 0}
                onChange={e => setEditData(p => ({ ...p, order: Number(e.target.value) }))}
                style={{ ...inputStyle, marginTop: 3 }} />
            </label>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={saveEdit} style={{
                flex: 1, background: "linear-gradient(135deg,#3e5878,#507c9c)", color: "#fff",
                border: "none", borderRadius: 8, padding: "9px 0",
                fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>Save Task</button>
              <button type="button" onClick={() => { setEditingId(null); setEditData(null); }} style={{
                background: "#f1f5f9", border: "none", borderRadius: 8, padding: "9px 16px",
                fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer", fontFamily: "inherit",
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}



const inputStyle = {
  display: "block", width: "100%", padding: "8px 12px",
  border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13,
  color: "#0f172a", background: "#fff", fontFamily: "inherit",
  marginTop: 4, transition: "border-color .15s",
};

const labelStyle = {
  display: "block", fontSize: 12, fontWeight: 700,
  color: "#64748b", letterSpacing: ".3px",
};

const btnPrimary = {
  background: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
  color: "#fff", border: "none", borderRadius: 9,
  padding: "9px 20px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};

const btnOutline = {
  background: "#fff", color: "#475569",
  border: "1.5px solid #e2e8f0", borderRadius: 9,
  padding: "9px 20px", fontSize: 13, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};