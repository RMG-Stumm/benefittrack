import { useState, useMemo } from "react";

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
  return { status: "Not Started", assignee: "", dueDate: "", completedDate: "", ...overrides }; 
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

function ClientModal({ client, onSave, onClose, tasksDb, onSaveCarrier, dueDateRules }) {
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
      return benefitId === "medical" ? applyPreRenewalRules(updated) : updated;
    });
  }

  // setTask updates a single field within a task object
  function setTask(group, id, field, val) {
    setData(p => {
      const existing = p[group]?.[id];
      const base = (!existing || typeof existing === "string")
        ? { status: existing || "Not Started", assignee: "", dueDate: "" }
        : { ...existing };
      return {
        ...p,
        [group]: {
          ...p[group],
          [id]: { ...base, [field]: val },
        },
      };
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

  function setOETask(taskId, field, val) {
    setData(p => {
      const prev = p.openEnrollment || {};
      const existing = prev.tasks?.[taskId];
      const base = (!existing || typeof existing === "string")
        ? { status: existing || "Not Started", assignee: "", dueDate: "", completedDate: "" }
        : { ...existing };
      return { ...p, openEnrollment: { ...prev, tasks: { ...(prev.tasks || {}), [taskId]: { ...base, [field]: val } } } };
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

  // Collapsible section state
  const [collapsed, setCollapsed] = useState({
    clientInfo: true, teamAssignment: true, benefitsSection: true,
    preRenewal: true, renewalTasks: true, oe: true, postOE: true,
    compliance: true, misc: true, employeeClasses: true, ongoing: true,
  });
  function toggleSection(id) { setCollapsed(p => ({ ...p, [id]: !p[id] })); }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 780,
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

        {/* Body — History view OR normal record */}
        <div style={{ overflow: "auto", padding: "20px 28px", flex: 1 }}>

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
          /* ── Normal client record ── */
          <div>

          {/* Basic Info */}
          <CollapseHeader id="clientInfo" title="Client Information" collapsed={collapsed} onToggle={toggleSection} />
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
                <input value={data.mainPhone || ""} onChange={e => set("mainPhone", e.target.value)} placeholder="(312) 555-0000" style={inputStyle} />
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
                      <input value={data.contactPhone || ""} onChange={e => set("contactPhone", e.target.value)} placeholder="(312) 555-0100" style={inputStyle} />
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
                      <input value={data.addlContactPhone || ""} onChange={e => set("addlContactPhone", e.target.value)} placeholder="(312) 555-0101" style={inputStyle} />
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
                <div style={{ display: "flex", alignItems: "center" }}>
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
                <input type="number" min="0" value={data.totalEligible || ""}
                  onChange={e => set("totalEligible", e.target.value)}
                  placeholder="# eligible employees" style={inputStyle} />
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
                      <input type="number" min="0" value={cls.eligible || ""}
                        onChange={e => updateClass(idx, "eligible", e.target.value)}
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
                            No active benefits on this client yet — add them in Benefits &amp; Carriers first.
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

          {/* Team */}
          <CollapseHeader id="teamAssignment" title="Team Assignment" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.teamAssignment && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            {Object.entries(TEAMS).map(([key, t]) => (
              <div key={key}
                onClick={() => set("team", key)}
                style={{
                  border: `2px solid ${data.team === key ? t.border : "#e2e8f0"}`,
                  background: data.team === key ? t.color : "#fafafa",
                  borderRadius: 12, padding: "12px 18px", cursor: "pointer",
                  transition: "all .15s", minWidth: 160,
                }}>
                <div style={{ fontWeight: 700, color: data.team === key ? t.text : "#475569", fontSize: 14, marginBottom: 6 }}>
                  Team {t.label}
                </div>
                {sortMembers(t.members).map(m => (
                  <div key={m.name} style={{ fontSize: 12, color: "#64748b" }}>
                    <span style={{ fontWeight: 600 }}>{m.name}</span> · {m.role}
                  </div>
                ))}
              </div>
            ))}
            {/* Lead selector */}
            <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 12, padding: "12px 18px", minWidth: 120 }}>
              <div style={{ fontWeight: 700, color: "#475569", fontSize: 14, marginBottom: 10 }}>Lead</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["RG", "DS"].map(opt => (
                  <button key={opt} type="button"
                    onClick={() => set("lead", data.lead === opt ? "" : opt)}
                    style={{
                      padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: `2px solid ${data.lead === opt ? "#6366f1" : "#e2e8f0"}`,
                      background: data.lead === opt ? "#eef2ff" : "#fff",
                      color: data.lead === opt ? "#4338ca" : "#64748b",
                      cursor: "pointer", fontFamily: "inherit", transition: "all .12s",
                    }}>{opt}</button>
                ))}
              </div>
            </div>
          </div>
          )}

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
            {(() => {
              let lastActiveCatId = null;
              return BENEFITS_SCHEMA.map(cat => {
              const prevActiveCatId = lastActiveCatId;
              if (!!(data.benefitActive || {})[cat.id]) lastActiveCatId = cat.id;
              if (hideNoClass && hasClasses) {
                const isOfferedCheck = !!(data.benefitActive || {})[cat.id];
                if (isOfferedCheck) {
                  const anyAssigned = (data.employeeClasses || []).some(
                    cls => !!(cls.classBenefits || {})[cat.id]?.included
                  );
                  if (!anyAssigned) return null;
                }
              }
              const leaves = cat.children.length > 0 ? cat.children : [{ id: cat.id, label: cat.label }];
              const isOffered = !!(data.benefitActive || {})[cat.id];
              const carrierOptions = carriersForBenefit(cat.id);
              const currentCarrier = (data.benefitCarriers || {})[cat.id] || "";
              const effectiveDate = (data.benefitEffectiveDates || {})[cat.id] || "";

              function toggleOffered() {
                const nowOffered = !isOffered;
                setData(p => {
                  const newActive = { ...(p.benefitActive || {}), [cat.id]: nowOffered };
                  const newDates = { ...(p.benefitEffectiveDates || {}) };
                  // Default effective date to renewal date when first enabled
                  if (nowOffered && !newDates[cat.id] && p.renewalDate) {
                    newDates[cat.id] = p.renewalDate;
                  }
                  return { ...p, benefitActive: newActive, benefitEffectiveDates: newDates };
                });
              }

              return (
                <div key={cat.id} style={{
                  borderRadius: 12,
                  border: `1.5px solid ${isOffered ? "#507c9c" : "#e2e8f0"}`,
                  background: isOffered ? "#f0f5fa" : "#f8fafc",
                  overflow: "hidden",
                  transition: "border-color .15s, background .15s",
                }}>
                  {/* ── Header row: always visible ── */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    borderBottom: isOffered && !((data.benefitCollapsed || {})[cat.id]) ? "1px solid #ccdaeb" : "none",
                  }}>
                    <input
                      type="checkbox"
                      checked={isOffered}
                      onChange={toggleOffered}
                      style={{ accentColor: "#507c9c", width: 16, height: 16, flexShrink: 0, cursor: "pointer" }}
                    />
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
                                  [cat.id]: { ...(p.benefitCommissions?.[cat.id] || {}), type: e.target.value },
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
                              const symbol = isPEPM ? "$" : isPct ? "%" : null;
                              const isPrefix = isPEPM;
                              return (
                                <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
                                  {symbol && isPrefix && (
                                    <span style={{ padding: "8px 8px", background: "#f1f5f9",
                                      border: "1.5px solid #e2e8f0", borderRight: "none",
                                      borderRadius: "8px 0 0 8px", fontSize: 13, color: "#475569", fontWeight: 600 }}>
                                      {symbol}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    value={(data.benefitCommissions || {})[cat.id]?.amount || ""}
                                    onChange={e => setData(p => ({
                                      ...p,
                                      benefitCommissions: {
                                        ...(p.benefitCommissions || {}),
                                        [cat.id]: { ...(p.benefitCommissions?.[cat.id] || {}), amount: e.target.value },
                                      },
                                    }))}
                                    placeholder={isPEPM ? "0.00" : isPct ? "0.0" : "Amount"}
                                    style={{
                                      ...inputStyle, marginTop: 0, flex: 1,
                                      borderRadius: isPrefix ? "0 8px 8px 0" : isPct ? "8px 0 0 8px" : "8px",
                                      borderLeft: isPrefix ? "none" : undefined,
                                      borderRight: (!isPrefix && symbol) ? "none" : undefined,
                                    }}
                                  />
                                  {symbol && !isPrefix && (
                                    <span style={{ padding: "8px 8px", background: "#f1f5f9",
                                      border: "1.5px solid #e2e8f0", borderLeft: "none",
                                      borderRadius: "0 8px 8px 0", fontSize: 13, color: "#475569", fontWeight: 600 }}>
                                      {symbol}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <label style={{ ...labelStyle, marginTop: 0 }}>
                          # Enrolled
                          <input
                            type="number" min="0"
                            value={(data.benefitEnrolled || {})[cat.id] || ""}
                            onChange={e => {
                              const v = e.target.value;
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

                      {/* # of Plans + plan details */}
                      {(() => {
                        const plans = (data.benefitPlans || {})[cat.id] || [];
                        const isBCBSIL = currentCarrier === "BCBSIL" || currentCarrier === "BCBS ?";
                        const setPlans = (newPlans) => setData(p => ({
                          ...p,
                          benefitPlans: { ...(p.benefitPlans || {}), [cat.id]: newPlans },
                        }));
                        const updatePlan = (idx, field, val) => {
                          const updated = plans.map((pl, i) => i === idx ? { ...pl, [field]: val } : pl);
                          setPlans(updated);
                        };
                        return (
                          <div style={{ background: "#fafafa", borderRadius: 8, border: "1px solid #e2e8f0", padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: plans.length > 0 ? 10 : 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: ".8px", textTransform: "uppercase" }}>
                                # of Plans
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{plans.length}</span>
                                <button type="button"
                                  onClick={() => setPlans([...plans, { name: "", type: "", groupNumber: "" }])}
                                  style={{ padding: "2px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                    border: "1.5px solid #507c9c", background: "#dce8f2", color: "#3e5878",
                                    cursor: "pointer", fontFamily: "inherit" }}>+ Add Plan</button>
                              </div>
                            </div>
                            {plans.map((pl, idx) => (
                              <div key={idx} style={{
                                display: "grid",
                                gridTemplateColumns: isBCBSIL ? "1fr 1fr 1fr 1fr auto" : "1fr 1fr 1fr auto",
                                gap: 8, marginTop: 8, alignItems: "end",
                              }}>
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
                                      ? ["PPO", "DHMO", "Voluntary PPO", "Voluntary DHMO"]
                                      : ["vision", "basic_life", "vol_life"].includes(cat.id)
                                      ? ["Non-contributory", "Contributory", "Voluntary", "Buy-Up"]
                                      : ["std", "ltd", "worksite", "identity_theft", "prepaid_legal", "pet_insurance", "telehealth"].includes(cat.id)
                                      ? ["Non-contributory", "Contributory", "Voluntary", "Buy-Up"]
                                      : ["nydbl_pfl"].includes(cat.id)
                                      ? ["ER-Paid", "Voluntary"]
                                      : ["fsa"].includes(cat.id)
                                      ? ["Health FSA", "LP FSA", "DC FSA"]
                                      : ["hsa_funding"].includes(cat.id)
                                      ? ["n/a"]
                                      : currentCarrier === "UHC" || currentCarrier === "UMR"
                                      ? ["PPO", "HMO", "HSA", "HRA", "Surest", "Nexus"]
                                      : currentCarrier === "BCBSIL" || currentCarrier === "BCBS ?"
                                      ? ["PPO", "HMO", "HSA", "HRA", "Options"]
                                      : ["PPO", "HMO", "HSA", "HRA"]
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
                                <button type="button"
                                  onClick={() => setPlans(plans.filter((_, i) => i !== idx))}
                                  style={{ padding: "6px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                    border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                                    cursor: "pointer", fontFamily: "inherit", marginBottom: 1 }}>✕</button>
                              </div>
                            ))}
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
                          {prevActiveCatId && (
                            <button type="button" onClick={() => {
                              const prev = prevActiveCatId;
                              setData(p => ({
                                ...p,
                                benefitEligibility: {
                                  ...(p.benefitEligibility || {}),
                                  [cat.id]: JSON.parse(JSON.stringify((p.benefitEligibility || {})[prev] || {})),
                                },
                              }));
                            }} style={{
                              padding: "2px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                              border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8",
                              cursor: "pointer", fontFamily: "inherit",
                            }}>
                              ↑ Same as {BENEFITS_SCHEMA.find(c => c.id === prevActiveCatId)?.label || "Above"}
                            </button>
                          )}
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

          {/* Pre-Renewal Tasks */}
          <CollapseHeader id="preRenewal" title="Pre-Renewal Tasks" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.preRenewal && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

              {/* Medical Renewal Status — all groups */}
              {(() => {
                const showRateRelief = !(data.marketSize === "ACA" && data.fundingMethod === "Fully Insured");
                return (
                <div style={{ background: "#fffbeb", borderRadius: 10, border: "1.5px solid #fde68a", padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>
                    Medical Renewal Status
                  </div>
                  {/* Renewal Received */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #fde68a" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 180 }}>
                      <input type="checkbox" checked={!!(data.renewalReceived||{}).received}
                        onChange={e => set("renewalReceived", { ...(data.renewalReceived||{}), received: e.target.checked })}
                        style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>Renewal Received</span>
                    </label>
                    {(data.renewalReceived||{}).received && (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                          Date:
                          <input type="date" value={(data.renewalReceived||{}).date||""}
                            onChange={e => {
                              const newRec = { ...(data.renewalReceived||{}), date: e.target.value };
                              setData(p => applyDDR({ ...p, renewalReceived: newRec }));
                            }}
                            style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: "auto" }} />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                          Renewal %:
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <input type="number" value={(data.renewalReceived||{}).pct||""}
                              onChange={e => set("renewalReceived", { ...(data.renewalReceived||{}), pct: e.target.value })}
                              placeholder="0"
                              style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: 72, textAlign: "right" }} />
                            <span style={{ marginLeft: 3, fontWeight: 700, color: "#475569" }}>%</span>
                          </div>
                        </label>
                      </>
                    )}
                  </div>
                  {/* Decisions Received Date */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 9, border: "1px solid #e2e8f0",
                    background: "#f8fafc" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", flex: 1 }}>
                      📋 Decisions Received
                    </span>
                    <input type="date"
                      value={data.decisionsReceivedDate || ""}
                      onChange={e => setData(p => applyDDR({ ...p, decisionsReceivedDate: e.target.value }))}
                      style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "3px 8px", width: 150 }} />
                  </div>

                  {/* Rate Relief — hidden for ACA + Fully Insured */}
                  {showRateRelief && (
                    <>
                  {/* Rate Relief Requested */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #fde68a" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 180 }}>
                      <input type="checkbox" checked={!!(data.rateRelief||{}).requested}
                        onChange={e => set("rateRelief", { ...(data.rateRelief||{}), requested: e.target.checked })}
                        style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>Rate Relief Requested</span>
                    </label>
                    {(data.rateRelief||{}).requested && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                        Date:
                        <input type="date" value={(data.rateRelief||{}).requestedDate||""}
                          onChange={e => set("rateRelief", { ...(data.rateRelief||{}), requestedDate: e.target.value })}
                          style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: "auto" }} />
                      </label>
                    )}
                  </div>
                  {/* Rate Relief Received */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #fde68a" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 180 }}>
                      <input type="checkbox" checked={!!(data.rateRelief||{}).received}
                        onChange={e => set("rateRelief", { ...(data.rateRelief||{}), received: e.target.checked })}
                        style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>Rate Relief Received</span>
                    </label>
                    {(data.rateRelief||{}).received && (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                          Date:
                          <input type="date" value={(data.rateRelief||{}).receivedDate||""}
                            onChange={e => set("rateRelief", { ...(data.rateRelief||{}), receivedDate: e.target.value })}
                            style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: "auto" }} />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                          Rate:
                          <div style={{ display: "flex", alignItems: "center" }}>
                            <input type="number" value={(data.rateRelief||{}).pct||""}
                              onChange={e => set("rateRelief", { ...(data.rateRelief||{}), pct: e.target.value })}
                              placeholder="0"
                              style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: 72, textAlign: "right" }} />
                            <span style={{ marginLeft: 3, fontWeight: 700, color: "#475569" }}>%</span>
                          </div>
                        </label>
                      </>
                    )}
                  </div>
                    </>
                  )}
                  {/* Renewal Tracker Updated — Mid-Market and Large only */}
                  {["Mid-Market", "Large"].includes(data.marketSize) && (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #fde68a" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 180 }}>
                      <input type="checkbox" checked={!!data.renewalTrackerUpdated}
                        onChange={e => set("renewalTrackerUpdated", e.target.checked)}
                        style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>Renewal Tracker Updated</span>
                    </label>
                    {data.renewalTrackerUpdated && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                        Date:
                        <input type="date" value={data.renewalTrackerUpdatedDate || ""}
                          onChange={e => set("renewalTrackerUpdatedDate", e.target.value)}
                          style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: "auto" }} />
                      </label>
                    )}
                  </div>
                  )}
                  {/* Carrier Change Tracker Updated */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 180 }}>
                      <input type="checkbox" checked={!!data.carrierChangeTrackerUpdated}
                        onChange={e => set("carrierChangeTrackerUpdated", e.target.checked)}
                        style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>Carrier Change Tracker Updated</span>
                    </label>
                    {data.carrierChangeTrackerUpdated && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                        Date:
                        <input type="date" value={data.carrierChangeTrackerUpdatedDate || ""}
                          onChange={e => set("carrierChangeTrackerUpdatedDate", e.target.value)}
                          style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: "auto" }} />
                      </label>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Ancillary Renewal Status */}
              {(() => {
                // Benefits to track for ancillary renewal status
                const ANCILLARY_BENEFIT_IDS = [
                  "dental", "vision", "std", "ltd", "basic_life", "vol_life",
                  "worksite", "telehealth", "identity_theft", "prepaid_legal",
                ];
                const carriers = data.benefitCarriers || {};
                const active = data.benefitActive || {};

                // Only include active benefits that have a carrier set
                const activeBenefits = ANCILLARY_BENEFIT_IDS
                  .filter(id => active[id])
                  .map(id => {
                    const cat = BENEFITS_SCHEMA.find(c => c.id === id);
                    const carrier = carriers[id] || "";
                    return { id, label: cat ? cat.label : id, carrier };
                  })
                  .filter(b => b.carrier && b.carrier !== "__other__");

                if (activeBenefits.length === 0) return null;

                // Group by carrier
                const byCarrier = {};
                activeBenefits.forEach(b => {
                  if (!byCarrier[b.carrier]) byCarrier[b.carrier] = [];
                  byCarrier[b.carrier].push(b);
                });
                const carrierGroups = Object.entries(byCarrier);
                const allSameCarrier = carrierGroups.length === 1;

                return carrierGroups.map(([carrier, benefits]) => {
                  const key = "anc_" + carrier.replace(/\s+/g, "_");
                  const stored = (data.ancillaryRenewalReceived || {})[key] || {};
                  const setAnc = (field, val) => setData(p => ({
                    ...p,
                    ancillaryRenewalReceived: {
                      ...(p.ancillaryRenewalReceived || {}),
                      [key]: { ...((p.ancillaryRenewalReceived || {})[key] || {}), [field]: val },
                    },
                  }));
                  const title = allSameCarrier
                    ? "Ancillary Renewal Status"
                    : `${carrier} Renewal Status`;

                  return (
                    <div key={key} style={{ background: "#fffbeb", borderRadius: 10, border: "1.5px solid #fde68a", padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#92400e", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>
                        {title}
                      </div>
                      {!allSameCarrier && (
                        <div style={{ fontSize: 11, color: "#78350f", marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {benefits.map(b => (
                            <span key={b.id} style={{ background: "#fef3c7", border: "1px solid #fcd34d",
                              borderRadius: 99, padding: "1px 8px", fontSize: 11, fontWeight: 600, color: "#92400e" }}>
                              {b.label}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Renewal Received */}
                      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 180 }}>
                          <input type="checkbox" checked={!!stored.received}
                            onChange={e => setAnc("received", e.target.checked)}
                            style={{ accentColor: "#f59e0b", width: 15, height: 15 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#78350f" }}>Renewal Received</span>
                        </label>
                        {stored.received && (
                          <>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                              Date:
                              <input type="date" value={stored.date || ""}
                                onChange={e => setAnc("date", e.target.value)}
                                style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: "auto" }} />
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                              Renewal %:
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <input type="number" value={stored.pct || ""}
                                  onChange={e => setAnc("pct", e.target.value)}
                                  placeholder="0"
                                  style={{ ...inputStyle, marginTop: 0, padding: "3px 8px", width: 72, textAlign: "right" }} />
                                <span style={{ marginLeft: 3, fontWeight: 700, color: "#475569" }}>%</span>
                              </div>
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  );
                });
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
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, preRenewal: { ...p.preRenewal, __extra: [...(p.preRenewal?.__extra||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"" }] }
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #507c9c", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Task
              </button>
            </div>
          )}

          {/* Renewal Tasks */}
          <CollapseHeader id="renewalTasks" title="Renewal Tasks" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.renewalTasks && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, renewalTasks: [...(p.renewalTasks||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", notes:"" }]
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Task
              </button>
            </div>
          )}

          {/* Open Enrollment Tasks */}
          <CollapseHeader id="oe" title="Open Enrollment Tasks" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.oe && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

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
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button type="button" onClick={() => setData(p => ({
                ...p, openEnrollment: { ...p.openEnrollment, tasks: { ...p.openEnrollment.tasks, __extra: [...(p.openEnrollment?.tasks?.__extra||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"" }] } }
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 8 }}>
                + Add OE Task
              </button>
            </div>
          )}

          {/* Post-OE Tasks */}
          <CollapseHeader id="postOE" title="Post-OE Tasks" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.postOE && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                const setPOF = (taskId, field, val) => setData(p => ({
                  ...p,
                  postOEFixed: {
                    ...(p.postOEFixed || {}),
                    [taskId]: { ...(p.postOEFixed?.[taskId] || {}), [field]: val },
                  },
                }));

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
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, postOETasks: [...(p.postOETasks||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"", notes:"" }]
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 4 }}>
                + Add Task
              </button>
            </div>
          )}

          {/* Compliance Tasks */}
          <CollapseHeader id="compliance" title="Compliance Tasks" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.compliance && (
            <div>
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
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setData(p => ({
                ...p, compliance: { ...p.compliance, __extra: [...(p.compliance?.__extra||[]), { title:"", status:"Not Started", assignee:"", dueDate:"", completedDate:"" }] }
              }))} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #93c5fd", background: "#dce8f2", color: "#3e5878",
                cursor: "pointer", fontFamily: "inherit", width: "100%", marginTop: 8 }}>
                + Add Task
              </button>
            </div>
          )}

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
            if (applicableOngoing.length === 0) return null;

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
                  </div>
                )}
              </>
            );
          })()}

          {/* Miscellaneous Tasks */}
          <CollapseHeader id="misc" title="Miscellaneous Tasks" accent="#7a8a3d" collapsed={collapsed} onToggle={toggleSection} />
          {!collapsed.misc && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(data.miscTasks || []).map((t, idx) => {
                  const isDone = t.status === "Complete";
                  return (
                    <div key={idx} style={{
                      background: isDone ? "#f0fdf4" : "#f8fafc", borderRadius: 10, padding: "10px 14px",
                      border: `1.5px solid ${isDone ? "#86efac" : t.status === "In Progress" ? "#fde68a" : "#e2e8f0"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
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
                        <StatusSelect value={t.status || "Not Started"} onChange={v => setData(p => {
                          const tasks = [...(p.miscTasks||[])];
                          tasks[idx] = { ...tasks[idx], status: v };
                          return { ...p, miscTasks: tasks };
                        })} />
                        <button type="button" onClick={() => setData(p => ({
                          ...p, miscTasks: (p.miscTasks||[]).filter((_,i) => i !== idx)
                        }))} style={{
                          background: "#fee2e2", border: "none", borderRadius: 6, padding: "4px 8px",
                          cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700,
                        }}>✕</button>
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
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setData(p => ({
                ...p,
                miscTasks: [...(p.miscTasks||[]), { title: "", status: "Not Started", assignee: "", dueDate: "", completedDate: "" }]
              }))} style={{
                marginTop: 8, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: "1.5px dashed #c4b5fd", background: "#faf5ff", color: "#7c3aed",
                cursor: "pointer", fontFamily: "inherit", width: "100%",
              }}>+ Add Miscellaneous Task</button>
            </div>
          )}
          {/* General Notes */}
          <SectionHeader>General Notes</SectionHeader>
          <textarea
            value={data.notes}
            onChange={e => set("notes", e.target.value)}
            rows={3}
            placeholder="Any additional notes..."
            style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />

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

function ClientCard({ client, onEdit, onDelete, tasksDb }) {
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
    const activePlans = leaves.filter(l => client.benefits[l.id]).map(l => l.label);
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
          <button onClick={() => onDelete(client.id)} style={{
            background: "#fee2e2", border: "none", borderRadius: 7, padding: "5px 10px",
            fontSize: 12, color: "#991b1b", cursor: "pointer", fontWeight: 600,
          }}>✕</button>
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
          {
            id: "preRenewal", label: "Pre-Renewal",
            tasks: PRERENEWAL_TASKS.filter(t => !t.acaOnly || client.marketSize === "ACA").map(t => ({
              label: getLabelForTask(t.id, tasksDb, t.label),
              status: getTaskStatus((client.preRenewal || {})[t.id]),
              dueDate: (typeof (client.preRenewal || {})[t.id] === "object" ? (client.preRenewal || {})[t.id]?.dueDate : "") || "",
            })),
          },

          ...(activeOETasks.length ? [{
            id: "oe", label: "Open Enrollment",
            tasks: activeOETasks.map(t => ({
              label: getLabelForTask(t.id, tasksDb, t.label),
              status: getTaskStatus((oe.tasks || {})[t.id]),
              dueDate: (typeof (oe.tasks || {})[t.id] === "object" ? (oe.tasks || {})[t.id]?.dueDate : "") || "",
            })),
          }] : []),
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
          ...(miscTasks.length ? [{
            id: "misc", label: "Misc",
            tasks: miscTasks.map(t => ({ label: t.title || "Unnamed", status: t.status || "Not Started", dueDate: t.dueDate || "" })),
          }] : []),
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
          ...(Object.keys(ongoingTasks).length ? [{
            id: "ongoing", label: "Ongoing",
            tasks: Object.entries(ongoingTasks).map(([id, t]) => ({
              label: getLabelForTask(id, tasksDb, id),
              status: t?.status || "Not Started",
              dueDate: t?.nextDue || "",
            })),
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

function MeetingsView({ meetings, onSave, clients, teams, onUpdateClient, tasksDb, onOpenClient }) {
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [filterTeam, setFilterTeam] = useState("All");
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
  const teamClients = form.team
    ? clients.filter(c => c.team === form.team)
    : clients;

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
    const subject = encodeURIComponent(`BenefitTrack Task Reminder — ${new Date().toLocaleDateString()}`);
    const lines = [`Hi ${member},`, "", "Here are your pending tasks:", ""];
    memberTasks.forEach(({ clientName, label, dueDate, status }) => {
      const due = dueDate ? ` — Due: ${formatDate(dueDate)}` : "";
      lines.push(`• ${clientName}: ${label}${due} [${status}]`);
    });
    lines.push("", "Please update task statuses in BenefitTrack as you complete them.", "", "Thank you!");
    return `mailto:${email}?subject=${subject}&body=${encodeURIComponent(lines.join("\n"))}`;
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
        const memberInfo = teamObj?.members?.find(m => m.name === assignee);
        tasksByMember[assignee].push({
          clientName: c.name, label: t.label, dueDate: t.dueDate,
          status: t.status, memberEmail: memberInfo?.email || "",
        });
      });
    });
    return tasksByMember;
  }

  const sorted = [...meetings]
    .filter(m => filterTeam === "All" || m.team === filterTeam)
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
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
            style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px" }}>
            <option value="All">All Teams</option>
            {teams.map(t => <option key={t.id} value={t.id}>Team {t.label}</option>)}
          </select>
          <button onClick={() => { setForm(emptyForm()); setShowForm(true); setEditId(null); }}
            style={btnPrimary}>+ New Meeting</button>
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
                const memberInfo = teamObj?.members?.find(m => m.name === member);
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
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={e => { e.stopPropagation(); setForm({ ...mtg }); setEditId(mtg.id); setShowForm(true); }}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569",
                        cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                    <button type="button" onClick={e => { e.stopPropagation(); if (confirm("Delete this meeting record?")) onSave(p => p.filter(m => m.id !== mtg.id)); }}
                      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                        cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                  </div>
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
function loadClients() {
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

function persistClients(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}


// ── Carrier Products Database ────────────────────────────────────────────────
const CARRIERS_STORAGE_KEY  = "benefittrack_carriers_v1";
const MEETINGS_STORAGE_KEY  = "benefittrack_meetings_v1";

function loadMeetings() {
  try {
    const saved = localStorage.getItem(MEETINGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch(e) { return []; }
}
function persistMeetings(list) {
  try { localStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}
const TASKS_STORAGE_KEY    = "benefittrack_tasks_v4";

// ── Default Task Database ────────────────────────────────────────────────────
const TASK_CATEGORIES_DB = ["Pre-Renewal", "Renewal", "Open Enrollment", "Post-OE", "Compliance", "Miscellaneous", "Ongoing"];

const RECURRENCE_OPTIONS = ["Monthly", "Quarterly", "Annually"];

// Due date rule anchors (events that rules are calculated relative to)
const DDR_ANCHORS = [
  { id: "renewal",           label: "Renewal Date" },
  { id: "renewal_receipt",   label: "Receipt of Renewal" },
  { id: "decision_receipt",  label: "Receipt of Decisions" },
  { id: "oe_start",          label: "OE Start Date" },
  { id: "oe_end",            label: "OE End Date" },
  { id: "plan_year_end",     label: "Plan Year End" },
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
];

function loadDueDateRules() {
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
function persistDueDateRules(list) {
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

function loadTasksData() {
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
function persistTasksData(list) {
  try { localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}

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
    ] },
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
    ] },
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
    ] },
  { id: "c_anthem",  name: "Anthem",  type: "National", category: "Medical",
    segments: ["Mid-Market","Large"], products: ["Medical"],
    funding: ["Fully Insured","Level-Funded","Self-Funded"],
    states: [], notes: "",
    requirements: [] },
  // ── Ancillary ────────────────────────────────────────────────────────────
  { id: "c_guardian",  name: "Guardian",          type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_principal", name: "Principal",          type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_mutualomaha", name: "Mutual of Omaha",  type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_unum",      name: "UNUM",               type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Dental","Vision"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_sunlife",   name: "Sun Life",            type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD","Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_metlife",   name: "MetLife (EM)",         type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental","Vision","Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_dearborn",  name: "Dearborn/Symetra",     type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Basic Life/AD&D","Voluntary Life/AD&D","STD","LTD"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_delta",     name: "Delta Dental",         type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Dental"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
  { id: "c_vsp",       name: "VSP",                  type: "National", category: "Ancillary",
    segments: ["ACA","Mid-Market","Large"],
    products: ["Vision"],
    funding: ["Fully Insured"], states: [], notes: "", requirements: [] },
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
    funding: [], states: [], notes: "", requirements: [] },
];

function loadCarriersData() {
  try {
    const saved = localStorage.getItem(CARRIERS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_CARRIERS_DATA;
  } catch(e) { return DEFAULT_CARRIERS_DATA; }
}
function persistCarriersData(list) {
  try { localStorage.setItem(CARRIERS_STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
}

export default function App() {
  // Load SheetJS for spreadsheet parsing
  React.useEffect(() => {
    if (window.XLSX) return;
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.async = true;
    document.head.appendChild(s);
  }, []);

  const [clients, setClientsRaw] = useState(() => loadClients());
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
      persistClients(next);
      return next;
    });
  }

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
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
  }, [clients, search, filterTeam, filterMarket, filterCarrier, filterSitus, filterFunding, sortField, sortDir]);

  function saveClient(data) {
    setClients(prev => prev.some(c => c.id === data.id)
      ? prev.map(c => c.id === data.id ? data : c)
      : [...prev, data]);
    // Modal stays open — user must click Cancel/✕ to close
  }

  function deleteClient(id) {
    if (confirm("Remove this client?")) setClients(p => p.filter(c => c.id !== id));
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
  const [view, setView] = useState("dashboard");
  const [meetings, setMeetingsRaw] = useState(() => loadMeetings());
  function setMeetings(updater) {
    setMeetingsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistMeetings(next);
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
  const [teamModal, setTeamModal] = useState(null); // null | team object | "new"
  const [dashFilter, setDashFilter] = useState({
    team: "All", market: "All", carrier: "All", situs: "All", funding: "All",
  });
  function setDashF(key, val) { setDashFilter(p => ({ ...p, [key]: val })); }
  // Keep backward-compat alias used in renewals view team pills
  const dashboardTeamFilter = dashFilter.team;
  function setDashboardTeamFilter(val) { setDashF("team", val); }
  const [carriersData, setCarriersDataRaw] = useState(() => loadCarriersData());
  function setCarriersData(updater) {
    setCarriersDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistCarriersData(next);
      return next;
    });
  }
  const [tasksData, setTasksDataRaw] = useState(() => loadTasksData());
  function setTasksData(updater) {
    setTasksDataRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistTasksData(next);
      // Re-apply DDR to all clients when task templates change (dueDateRule on a task may have changed)
      setClients(prevClients => {
        const ddr = loadDueDateRules();
        return prevClients.map(c => applyDueDateRulesToClient(c, next, ddr));
      });
      return next;
    });
  }

  const [dueDateRules, setDueDateRulesRaw] = useState(() => loadDueDateRules());
  function setDueDateRules(updater) {
    setDueDateRulesRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      persistDueDateRules(next);
      // Re-apply DDR to all clients with the new rule set
      setClients(prevClients => {
        const tasks = loadTasksData();
        return prevClients.map(c => applyDueDateRulesToClient(c, tasks, next));
      });
      return next;
    });
  }
  function persistTeams(list) {
    try { localStorage.setItem("benefittrack_teams_v1", JSON.stringify(list)); } catch(e) {}
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
          <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABoAHMDASIAAhEBAxEB/8QAHAABAAMBAAMBAAAAAAAAAAAAAAYHCAUBAwQC/8QAPBAAAQMEAAQDBQQIBgMAAAAAAQIDBAAFBhEHEiExE0FhFCJRcZEIMoGxFRcjQkNSgsEmM0RVYqFyotL/xAAaAQEAAgMBAAAAAAAAAAAAAAAAAgMBBAUG/8QAJREAAwADAAEDAwUAAAAAAAAAAAECAwQRMQUSITJBYUKRobHB/9oADAMBAAIRAxEAPwDZdKUoBSlKAUpSgFK59wvtkt5In3i3xCnv48lCNfU1yHeImBN/ezTHun8txaP5KoCT0qKt8R8Ac+7mlgH/AJT20/ma6UHKsYn69hyOzyt9vBmtr39FUB2KV4SoKSFJIIPUEHvXmgFKUoBSlKAUpSgFQDijxOiYTcIdoasdyvV3nN+JHixU9FJ2R1PU72OwSan9VbmqC39onAH9aD0Ke1v48rSlf3oYZxpd84zXiGqbMOPcPbTr3pE5xK3kj+rY38wmoFfF4Cp1S8t4t5VlL377FvSpDR9BzbRr5EVVGSXK6XO7SHbtcJc2QlxQK5Dqlkdda6npXNrpRpT+pmjW0/si0FZPwctgAtPDOXclD+JcbipBPqUgrTQ8TsVbUPZuEeJpSPJ1oOH6lNVfUr4fcPcnzh5wWOGn2dk8rsp9XIyg99b0ST1HQAnrVr18MrrRWs2SnxFqZZkmJWnJJtr/AFX4o81Hc5AoREIUroPgmuYq88JbgNXPhgiOT94w5ik69QE8ldPi7w9yWHdLnkgjsybetfiLUwvam06A2pJAOvlvVVhWcevhyQmkUZdjPjtp/wBFgwbPwqcWHMezLLsQfJ2lJcUUJP8ARs/VVTG1Q+LlvYEzEc+smcQEa2zMCUuH05gSQfmsfKqNr2w5UqFITIhyXozyfuuNLKFD5EdajehL+lko9QpfUjQ2M8W5xyaDi2aYbcrBdZrgaYWP2jDqidbCunT1HN86taqSvbkq45JwVVLdXIkPpfkuLWdqUQw2sk1dtculx8OtL6uilKVEkKUpQCqt42OG3Zjw5v3VKGL4Ya1+SRISEnf4JP0q0qgP2grS7deFN3MYK9rgJTPjqSNlKmlBRI/pCqGH4MkcQoRtud36CQQGLi+hPqnxDo/TVcOp/wAd0NyMyj5FHA9mv9ujXFvl7AqQErHz5knY9agFd3HXuhM5NrlNCtZ4e85j/wBmVibaVezSRAU6HEjqFrcO1fPr0+Q+FZMrWvBl235twITjqXw2+wwuFIA6lpWyUK18COU/gR5VRtfClvx0twfLpLzw+r7P94uWQ4jdI97mPTw3ILYW+srUUKQNpJPUjv3+NZwqxMdPE/DHJ1rstouHL458VTduL6FKHTaVcp2NfCosrEMsSkqVi97SB3JgO/8AzVuKZi6fVxmpmqriZ4+rpxKV9Uq23GJv2qBKY138RlSfzFdXh1a1XrObPbgnmS5KSpwf8E+8r/1Sa2HSS6aylulJcaGCrjzhtkSklOP404+oDshSx4P5BP1FW/VX8KR+muJme5adraExu0xF+XKwkBzR8wVcpq0K8631npZXEKUpWDIpSlAK/EhlqRHcjvIC2nUFC0nspJGiK/dKAyTmuOylYBMsJbW7c8Ju64wSOq3IMlW2lgdz72tfAGoKqww7UP8AEUtxuV/t8XSnk+jqj7rR9PeUPNIrT/FCGzYMzgZc4XG7VdWDY74ptRSW0OdGXtjsUqOt9wCKy9mFimYzk0+xzx+3iOlHNrQWnulY9CCD+NV7XqGbXxqcf7mteGXXuZ4N2Yj+7a7TCipH8R5sSXVepU4CkH1QlNSLh9xIyDF8ljXF24TJsEHkkQ1vEoW2e/KknSVDuCNdR8N1CKu5vhrjCuApzEtSv0r7CX+bxzyc3Pr7vyrjzl2M9OnTbXz5JzPPBaXE2E7k+HR8qxS5yQ40x46DHeUjx2e5GgfvDqdd+471Tduz7MoCgWMinL15Pr8YfRe6sn7Jct+Rw8nRXllbUa4rS0D15UqQhRSPTZJ/E1SslITJdSkaAWQB+NU+oU17M0Np1/hZ0tKwcbL1HWlF5t8ac15ra205/dJ+WhUyuXEHGVYBeczt0UNSreypCC/HSlwPLGkJCuoOyR2J6d6zw2hbjiW20qWtRASkDZJPkKtm1Y8i5ZNj3DtAC4di5b1kKgfdXJUP2TJ0euv+wPSr/S9jYy21T7KMFjcF8fdxvhraLfKQUzXGjJl8x94uuHnVv1GwPwqY0pXbJilKUApSlAKUpQHPySzwsgsM6y3FvxIsxlTLg8wCO49Qeo9RWZ+INguF5xuU3NT4mU4dqJcNJ0ZsDuzJA7nQ7n4Ek+VaoqvuKuOXBMuJnOMRW3r7akFD8cjpcIh/zGFfE62U+v4VXlxrLDlmGjHFak4TLt+ccBXMTYnIYmtRnIj6T1U0SoqQsp7lJBT1+Y8qpPibjdvjtxstxfbuNXYktDzhvfvx1/Ag71vy+OtmGxJMmI+H4kh2O6nstpZSofiK4kU9bI1S/BWnw11wyxpHCnArj+m7lHeJkLlOLb2E/dSlKE76knl+p1Wd3FFbilnuokmpRxTly381uDL8p91tpwBtC3CoI90dge1fHhWNyMkupYSsR4TCfFmyl9EMNDqVEnpvQOh/YE1q7eV57WGJ+n4RI7XD+LGslqncQbw1zw7WOWCye8qWeiEpHnokdvPr5Grl4PYzLx/GnJd4UXL9eHjPubh3sOr6hHXsEjpr47qIYFbGc9yCHe0wvZ8Jx5RasUZf+sfSdKkqHmAd635+u6uSvQamstfGoXn7mUKUpWySFKUoBSlKAUpSgFKUoCmOJWPx8Mn3C/NWldww69e7kVtaG/Z1k9JbQ8iD1OvPr07ijeIuFOY0uPcrdKTdMduA57fcW+qVpP7i/wCVY+Hno/AgbXdbbdaW06hLja0lKkqGwoHuCPMVSmVYvJ4eJnOwLScg4fT1ldysuipyAT3eZ8+Ud9DqPTXMNfY1pzL8kWiK3/Hbnk/FG4222M86y6kuOHohpPKnalHyH5+VdmDaGsulfq8xB91GJwXQrI7030M90dfAbPmN67dAOvUa5+mzcn+JMiVZuH7DtoxuSrd6v6myl2T0ALDIV15tdCT0A326BVtY3ZLXjlljWazRERYUZPK22n/sk9ySepJ6k1XraU4adv5p/wABI+m2QYltt8e3wI7ceLHbDbLSBpKEgaAFfRSlbhIUpSgFKUoBSlKAUpSgFKUoBQgEaI2KUoD0wYkSBFRFgxmYsdG+VplAQlOzs6A6dyTXupSgFKUoBSlKAUpSgP/Z" style={{ height: 44, width: "auto" }} alt="logo" />
          <div>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 18, color: "#0f172a", lineHeight: 1 }}>
              BenefitTrack
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>Client Renewal Management</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Nav tabs */}
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 9, padding: 3, gap: 2 }}>
            {[["dashboard","🏠 Dashboard"],["clients","👥 All Clients"],["renewals","⏰ Renewals"],["meetings","📋 Meetings"],["teams","🤝 Teams"],["carriers","📋 Carriers"],["tasks","✅ Tasks"]].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={{
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
            <button onClick={() => setModal(newClient(tasksData))} style={btnPrimary}>
              + Add Client
            </button>
            <label title="Import from spreadsheet" style={{
              ...btnPrimary, display: "flex", alignItems: "center", gap: 6,
              cursor: "pointer", userSelect: "none",
            }}>
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
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 32px" }}>

        {/* Stats tiles — Open Tasks */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(1,1fr)", gap: 14, marginBottom: 28, maxWidth: 320 }}>
          {[
            { label: "Open Tasks", value: openTasksCount, icon: "🚨", color: "#ef4444", action: () => setView("overdue") },
          ].map(s => (
            <div key={s.label}
              className="stat-tile"
              onClick={s.action || undefined}
              style={{
                background: "#fff", borderRadius: 14, padding: "16px 20px",
                border: s.action ? "1.5px solid #bfdbfe" : "1px solid #e2e8f0",
                display: "flex", alignItems: "center", gap: 14,
                cursor: s.action ? "pointer" : "default",
                boxShadow: "0 1px 4px rgba(0,0,0,.05)",
              }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, fontSize: 20,
                background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{s.label}</div>
              </div>
              {s.action && <div style={{ fontSize: 16, color: "#93c5fd" }}>→</div>}
            </div>
          ))}
        </div>

        {/* ── DASHBOARD VIEW ── */}
        {view === "dashboard" && (() => {
          const allCarriersD = [...new Set(clients.map(c =>
            (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || ""
          ).filter(Boolean))].sort();
          const allSitusD  = [...new Set(clients.map(c => c.groupSitus || "").filter(Boolean))].sort();
          const allFundingD = [...new Set(clients.map(c => c.fundingMethod || "").filter(Boolean))].sort();

          const dashFiltered = upcoming120.filter(c => {
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

          const activeDashFilters = Object.values(dashFilter).filter(v => v !== "All").length;

          return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
                  Upcoming Renewals
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Next 120 days — {dashFiltered.length} of {upcoming120.length} client{upcoming120.length !== 1 ? "s" : ""}
                  {activeDashFilters > 0 && (
                    <button onClick={() => setDashFilter({ team:"All",market:"All",carrier:"All",situs:"All",funding:"All" })}
                      style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, color: "#ef4444",
                        background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Clear {activeDashFilters} filter{activeDashFilters > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter bar */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {/* Team dropdown */}
              <select value={dashFilter.team} onChange={e => setDashF("team", e.target.value)}
                style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 140px",
                  background: dashFilter.team !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Teams</option>
                {Object.entries(TEAMS).map(([key, t]) => (
                  <option key={key} value={key}>Team {t.label}</option>
                ))}
              </select>
              {/* Dropdown filters */}
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
                  {allFundingD.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={dashFilter.carrier} onChange={e => setDashF("carrier", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 140px",
                    background: dashFilter.carrier !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Carriers</option>
                  {allCarriersD.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={dashFilter.situs} onChange={e => setDashF("situs", e.target.value)}
                  style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 135px",
                    background: dashFilter.situs !== "All" ? "#dce8f0" : undefined }}>
                  <option value="All">All Situs</option>
                  {allSitusD.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {dashFiltered.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: "48px 20px", textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#64748b" }}>
                  No renewals in the next 120 days{activeDashFilters > 0 ? " matching these filters" : ""}
                </div>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                {dashFiltered.map((c, i) => {
                  const team = TEAMS[c.team];
                  const badge = renewalBadge(c.renewalDate);
                  const isLast = i === dashFiltered.length - 1;
                  const urgency = c._days <= 30 ? "#fef3c7" : c._days <= 60 ? "#eff6ff" : "#f8fafc";
                  return (
                    <div key={c.id}
                      onClick={() => setModal(c)}
                      style={{
                        display: "flex", alignItems: "center", gap: 16,
                        padding: "14px 20px",
                        borderBottom: isLast ? "none" : "1px solid #f1f5f9",
                        background: urgency,
                        cursor: "pointer",
                        transition: "background .12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#ccdaeb"}
                      onMouseLeave={e => e.currentTarget.style.background = urgency}
                    >
                      {/* Day countdown */}
                      <div style={{
                        minWidth: 52, textAlign: "center",
                        background: badge ? badge.bg : "#f1f5f9",
                        borderRadius: 10, padding: "6px 4px",
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: badge ? badge.text : "#64748b", lineHeight: 1 }}>{c._days}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: badge ? badge.text : "#94a3b8", letterSpacing: ".5px" }}>DAYS</div>
                      </div>

                      {/* Client info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {c.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          Renews {formatDate(c.renewalDate)}
                        </div>
                      </div>

                      {/* Tags */}
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {team && <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: team.color, color: team.text }}>
                          {team.label}
                        </span>}
                        <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: "#f1f5f9", color: "#475569" }}>
                          {c.marketSize}
                        </span>
                        {(() => {
                          const mc = (c.benefitCarriers || {}).medical || (c.carriers || [])[0];
                          return mc ? <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#f0fdf4", color: "#166534" }}>{mc}</span> : null;
                        })()}
                        {c.fundingMethod && (
                          <span style={{ padding: "2px 9px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>
                            {c.fundingMethod === "Fully Insured" ? "FI" : c.fundingMethod === "Level-Funded" ? "LF" : "SF"}
                          </span>
                        )}
                      </div>

                      <div style={{ color: "#cbd5e1", fontSize: 14, flexShrink: 0 }}>›</div>
                    </div>
                  );
                })}
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

          const renewalsFiltered = upcoming120.filter(c => {
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
                    <button onClick={() => setDashFilter({ team:"All",market:"All",carrier:"All",situs:"All",funding:"All" })}
                      style={{ marginLeft: 10, fontSize: 11, fontWeight: 700, color: "#ef4444",
                        background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Clear {activeRFilters} filter{activeRFilters > 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              </div>
              <button onClick={() => setView("dashboard")} style={{ ...btnOutline, fontSize: 12 }}>← Back</button>
            </div>

            {/* Filter bar — same structure as dashboard */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {/* Team dropdown */}
              <select value={dashFilter.team} onChange={e => setDashF("team", e.target.value)}
                style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "5px 10px", flex: "0 0 140px",
                  background: dashFilter.team !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Teams</option>
                {Object.entries(TEAMS).map(([key, t]) => (
                  <option key={key} value={key}>Team {t.label}</option>
                ))}
              </select>
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
                  <ClientCard key={c.id} client={c} onEdit={setModal} onDelete={deleteClient} tasksDb={tasksData} />
                ))}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── OPEN TASKS VIEW ── */}
        {view === "overdue" && (
          <OpenTasksView clients={clients} onOpenClient={setModal} tasksDb={tasksData} onUpdateTask={saveClient} />
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
                <button onClick={() => setView("dashboard")} style={{ ...btnOutline, fontSize: 12 }}>← Back</button>
                <button onClick={() => setTeamModal({ id: "", label: "", members: [] })} style={btnPrimary}>+ Add Team</button>
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
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
                        {formatRevenue(clients.filter(c => c.team === team.id).reduce((sum, c) => sum + parseRevenue(c.annualRevenue), 0))}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>Annual Revenue</div>
                    </div>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontWeight: 800, fontSize: 20, color: "#0f172a" }}>
                  All Clients
                </div>
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
            </div>

            {/* Filters row 1: search + core filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍  Search clients..."
                style={{ ...inputStyle, flex: "1 1 200px", minWidth: 160 }}
              />
              <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                style={{ ...inputStyle, flex: "0 0 150px", background: filterTeam !== "All" ? "#dce8f0" : undefined }}>
                <option value="All">All Teams</option>
                {Object.keys(TEAMS).map(k => <option key={k} value={k}>Team {k}</option>)}
              </select>
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
                  <ClientCard key={c.id} client={c} onEdit={setModal} onDelete={deleteClient} tasksDb={tasksData} />
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
          />
        )}

        {view === "carriers" && (
          <CarriersView
            carriers={carriersData}
            onSave={setCarriersData}
          />
        )}

        {view === "tasks" && (
          <TasksView
            tasks={tasksData}
            onSave={setTasksData}
            dueDateRules={dueDateRules}
            onSaveDueDateRules={setDueDateRules}
          />
        )}

      </div>

      {modal && (
        <ClientModal client={modal} onSave={saveClient} onClose={() => setModal(null)} tasksDb={tasksData} onSaveCarrier={setCarriersData} dueDateRules={dueDateRules} />
      )}

      {/* Team Edit/Add Modal */}
      {teamModal && (
        <TeamEditModal
          team={teamModal}
          onSave={t => {
            const updated = t.id && teams.some(x => x.id === t.id)
              ? teams.map(x => x.id === t.id ? t : x)
              : [...teams, { ...t, id: t.label.replace(/\s+/g,"_").toLowerCase() || Date.now().toString() }];
            setTeams(updated);
            persistTeams(updated);
            setTeamModal(null);
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
        />
      )}
    </div>
  );
}

// ── Team Edit Modal ──────────────────────────────────────────────────────────

function TeamEditModal({ team, onSave, onDelete, onClose }) {
  const [data, setData] = useState({ ...team });

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
                <input value={m.role || ""} onChange={e => updateMember(i, "role", e.target.value)}
                  placeholder="Role"
                  style={{ padding: "7px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }} />
                <input type="email" value={m.email || ""} onChange={e => updateMember(i, "email", e.target.value)}
                  placeholder="email@company.com"
                  style={{ padding: "7px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, fontFamily: "inherit" }} />
                <button onClick={() => removeMember(i)} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "7px 10px", cursor: "pointer", fontSize: 12, color: "#991b1b", fontWeight: 700 }}>✕</button>
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
            {team.id && (
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

// ── CarriersView ─────────────────────────────────────────────────────────────

function CarriersView({ carriers, onSave }) {
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
        <button type="button" onClick={startNew} style={{
          background: "linear-gradient(135deg,#2d4a6b,#4a7fa5)", color: "#fff",
          border: "none", borderRadius: 9, padding: "9px 20px",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
        }}>+ Add Carrier</button>
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

      <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 420px" : "1fr", gap: 16 }}>
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
                    <button type="button" onClick={() => isEditing ? (setEditingId(null), setEditData(null)) : startEdit(carrier)}
                      style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${isEditing ? "#4a7fa5" : "#e2e8f0"}`,
                        background: isEditing ? "#dce8f0" : "#f8fafc",
                        color: isEditing ? "#2d4a6b" : "#475569",
                        cursor: "pointer", fontFamily: "inherit" }}>{isEditing ? "Close" : "Edit"}</button>
                    <button type="button" onClick={() => deleteCarrier(carrier.id)}
                      style={{ padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                        border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b",
                        cursor: "pointer", fontFamily: "inherit" }}>✕</button>
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
              Notes
              <textarea value={editData.notes} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                placeholder="Special conditions, eligibility rules, caveats..."
                rows={3} style={{ ...inputStyle, marginTop: 3, resize: "vertical", fontFamily: "inherit" }} />
            </label>

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
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Miscellaneous" || categoryFilter === "Misc") {
    (c.miscTasks || []).forEach((t, i) => push(t.title || "Unnamed", "Miscellaneous", t, "miscTasks", null, i));
  }
  // Ongoing
  if (!categoryFilter || categoryFilter === "All" || categoryFilter === "Ongoing") {
    const medCarrierC  = (c.benefitCarriers || {}).medical || (c.carriers || [])[0] || "";
    const medEnrolledC = Number((c.benefitEnrolled || {}).medical) || 0;
    const medPlansC    = (c.benefitPlans || {}).medical || [];
    const hasHMOC = medPlansC.some(p => p.type && p.type.toUpperCase().includes("HMO"));
    const hasPPOC = medPlansC.some(p => p.type && p.type.toUpperCase().includes("PPO"));
    Object.entries(c.ongoingTasks || {}).forEach(([taskId, t]) => {
      if (!t || t.status === "N/A") return;
      const taskDef = (tasksDb || []).find(td => td.id === taskId);
      if (taskDef?.eligibilityRule === "blue_insights") {
        if (medEnrolledC < 50 || (!hasHMOC && !hasPPOC)) return;
      }
      push(taskDef?.label || taskId, "Ongoing", t, "ongoingTasks", taskId);
    });
  }
  return items;
}

// ── OpenTasksView ─────────────────────────────────────────────────────────────

function OpenTasksView({ clients, onOpenClient, tasksDb, onUpdateTask }) {
  const [expandedTask, setExpandedTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addForm, setAddForm] = useState({
    clientId: "", category: "Misc", title: "", assignee: "", dueDate: "", notes: "",
  });
  const [ovTeam,     setOvTeam]     = useState("All");
  const [ovMarket,   setOvMarket]   = useState("All");
  const [ovCarrier,  setOvCarrier]  = useState("All");
  const [ovSitus,    setOvSitus]    = useState("All");
  const [ovFunding,  setOvFunding]  = useState("All");
  const [ovCat,      setOvCat]      = useState("All");
  const [ovAssignee, setOvAssignee] = useState("All");
  const [ovStatus,   setOvStatus]   = useState("All");
  const [ovSort,     setOvSort]     = useState("renewal");
  const [ovWindow,   setOvWindow]   = useState("all");   // "all" | "30" | "60" | "90" | "120" | "overdue"
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
    return clients
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
  }, [clients, ovWindow, ovTeam, ovMarket, ovCarrier, ovSitus, ovFunding, ovCat, ovAssignee, ovStatus, ovSort]);

  const catColors = {
    "Pre-Renewal":     { bg: "#dce8f2", text: "#3e5878" },
    "Renewal":         { bg: "#d6e4f0", text: "#2d4a6b" },
    "Open Enrollment": { bg: "#dde7c7", text: "#54652d" },
    "Post-OE":         { bg: "#e8efd5", text: "#3d4f20" },
    "Compliance":      { bg: "#eef0e0", text: "#7a8a3d" },
    "Miscellaneous":   { bg: "#edf2f7", text: "#3e5878" },
    "Misc":            { bg: "#edf2f7", text: "#3e5878" },
    "Ongoing":         { bg: "#d8e6d0", text: "#54652d" },
  };
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
                setOvTeam("All"); setOvMarket("All"); setOvCarrier("All"); setOvSitus("All");
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
        const TASK_CATS = ["Misc", "Post-OE", "Pre-Renewal", "Compliance", "Open Enrollment"];

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
          if (addForm.category === "Misc") {
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
                  {[...clients].sort((a,b) => a.name.localeCompare(b.name)).map(c => (
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
              <button type="button" onClick={() => { setShowAddTask(false); setAddForm({ clientId: "", category: "Misc", title: "", assignee: "", dueDate: "", notes: "" }); }}
                style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569",
                  cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              {selClient && (
                <span style={{ fontSize: 11, color: "#64748b", alignSelf: "center", marginLeft: 4 }}>
                  → will appear in {selClient.name}&apos;s {addForm.category} tasks
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
          <select value={ovTeam} onChange={e => setOvTeam(e.target.value)}
            style={{ ...inputStyle, marginTop: 0, fontSize: 12, padding: "4px 10px",
              background: ovTeam !== "All" ? "#dce8f0" : "#fff", flex: "1 1 120px", maxWidth: 160 }}>
            <option value="All">All Teams</option>
            {Object.entries(TEAMS).map(([key, t]) => (
              <option key={key} value={key}>Team {t.label}</option>
            ))}
          </select>
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
            { val: ovCat,      set: setOvCat,      opts: ["Pre-Renewal","Renewal","Open Enrollment","Post-OE","Compliance","Miscellaneous","Misc","Ongoing"], placeholder: "All Categories" },
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
                      const cc = catColors[cat] || catColors["Misc"];
                      return (
                        <div key={cat} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1px",
                            textTransform: "uppercase", color: cc.text, marginBottom: 5 }}>{cat}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {tasks.map((t, ti) => {
                              const sc = statusChip[t.status] || statusChip["Not Started"];
                              const dot = statusDot[t.status] || statusDot["Not Started"];
                              const taskDate = t.dueDate ? new Date(t.dueDate + "T12:00:00") : null;
                              const pastDue  = taskDate && taskDate < today;
                              const taskKey  = `${c.id}__${t.group}__${t.taskId || t.arrayIndex}__${ti}`;
                              const taskOpen = expandedTask === taskKey;
                              const teamMembers = c.team === "India" ? INDIA_MEMBERS : JULIET_MEMBERS;

                              // Shared updater — writes any field(s) back to the client record
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
                                }
                                onUpdateTask(updated);
                              }

                              return (
                                <div key={ti} style={{
                                  borderRadius: 7, overflow: "hidden",
                                  border: `1px solid ${pastDue ? "#fecdd3" : taskOpen ? "#bfdbfe" : "#e2e8f0"}`,
                                  background: taskOpen ? "#f8fbff" : pastDue ? "#fff1f2" : "#f8fafc",
                                }}>
                                  {/* Summary row — always visible */}
                                  <div onClick={e => { e.stopPropagation(); setExpandedTask(taskOpen ? null : taskKey); }}
                                    style={{ display: "flex", alignItems: "center", gap: 8,
                                      padding: "6px 10px", cursor: "pointer", userSelect: "none" }}>
                                    <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                                      background: pastDue ? "#f43f5e" : dot }} />
                                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
                                      {t.label}
                                    </span>
                                    {t.assignee && !taskOpen && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: "#3e5878",
                                        background: "#e8f0f7", borderRadius: 99, padding: "1px 7px" }}>
                                        {t.assignee}
                                      </span>
                                    )}
                                    {t.dueDate && !taskOpen && (
                                      <span style={{ fontSize: 10, fontWeight: 600,
                                        color: pastDue ? "#e11d48" : "#64748b" }}>
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
                                      style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px",
                                        borderRadius: 99, border: `1.5px solid ${sc.bg}`,
                                        background: sc.bg, color: sc.text, cursor: "pointer",
                                        fontFamily: "inherit", flexShrink: 0 }}>
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
                                        <input type="date" value={t.completedDate || ""} onChange={e => updateTaskFields({ completedDate: e.target.value, ...(e.target.value ? { status: "Complete" } : {}) })}
                                          style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                                      </label>
                                      <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "flex", flexDirection: "column", gap: 3 }}>
                                        Notes
                                        <input type="text" value={t.notes || ""} onChange={e => updateTaskFields({ notes: e.target.value })}
                                          placeholder="Notes…"
                                          style={{ ...inputStyle, marginTop: 0, fontSize: 11, padding: "4px 8px" }} />
                                      </label>
                                    </div>
                                  )}
                                </div>
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

function TasksView({ tasks, onSave, dueDateRules, onSaveDueDateRules }) {
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
    "Misc":            { bg: "#edf2f7", text: "#3e5878", border: "#507c9c" },
    "Ongoing":         { bg: "#d8e6d0", text: "#54652d", border: "#7a8a3d" },
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
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TASK_CATEGORIES_DB.map(cat => {
          const cc = categoryColors[cat] || categoryColors["Misc"];
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
        {/* Due Date Rules tab */}
        <button type="button" onClick={() => { setShowDDR(s => !s); setEditingId(null); }} style={{
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
        </button>
      </div>

      {/* Due Date Rules management panel */}
      {showDDR && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#6d28d9" }}>Due Date Rules</div>
            <button type="button" onClick={() => {
              const newId = "ddr_" + Date.now();
              setDdrEditing(newId);
              setDdrForm({ id: newId, label: "", anchor: "renewal", direction: "before", days: 30, builtin: false });
            }} style={{
              background: "linear-gradient(135deg,#6d28d9,#7c3aed)", color: "#fff",
              border: "none", borderRadius: 8, padding: "7px 16px",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}>+ New Rule</button>
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
                        {!rule.builtin && (
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
            const cc = categoryColors[task.category] || categoryColors["Misc"];
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <button type="button" onClick={() => moveTask(task.id, -1)} disabled={idx === 0}
                      style={{ padding: "1px 5px", fontSize: 10, border: "1px solid #e2e8f0",
                        borderRadius: 4, background: "#f8fafc", color: "#94a3b8", cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.3 : 1, fontFamily: "inherit" }}>▲</button>
                    <button type="button" onClick={() => moveTask(task.id, 1)} disabled={idx === filtered.length - 1}
                      style={{ padding: "1px 5px", fontSize: 10, border: "1px solid #e2e8f0",
                        borderRadius: 4, background: "#f8fafc", color: "#94a3b8",
                        cursor: idx === filtered.length - 1 ? "default" : "pointer",
                        opacity: idx === filtered.length - 1 ? 0.3 : 1, fontFamily: "inherit" }}>▼</button>
                  </div>

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
