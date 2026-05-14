import { supabase } from './supabase.js'

// ── USER PROFILE ──────────────────────────────────────────────────────────────

export async function fetchUserProfile(authUserId) {
  // Simple flat query — no joins that can hang on missing tables
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, team, active, first_name, last_name, auth_user_id')
    .eq('auth_user_id', authUserId)
    .single();

  if (error) {
    console.error('fetchUserProfile error:', error);
    return null;
  }

  return {
    ...data,
    teams: [], // team membership resolved from teams table in App via userTeams useMemo
  };
}

// ── CLIENTS ──────────────────────────────────────────────────────────────────

export async function fetchClients() {
  const { data, error } = await supabase.from('clients').select('*')
  if (error) { console.error('fetchClients error:', error); return null }
  return data.map(row => {
    // Start with the JSONB blob for all legacy fields
    const base = row.data ? { ...row.data, id: row.id } : { id: row.id }
    // Override with proper columns where they exist — these are the source of truth now
    return {
      ...base,
      id:               row.id,
      name:             row.legal_name    || base.name             || '',
      clientStatus:     row.status        ? (row.status.charAt(0).toUpperCase() + row.status.slice(1)) : (base.clientStatus || 'Active'),
      marketSize:       row.market_segment || base.marketSize      || '',
      employerSize:     row.employer_size  || base.employerSize    || '',
      employerType:     row.employer_type  || base.employerType    || '',
      fundingMethod:    row.funding_method || base.fundingMethod   || '',
      groupSitus:       row.situs_state    || base.groupSitus      || '',
      totalEligible:    row.eligible_employee_count != null ? String(row.eligible_employee_count) : (base.totalEligible || ''),
      medicalEnrolled:  row.enrolled_employee_count != null ? String(row.enrolled_employee_count) : (base.medicalEnrolled || ''),
      team:             row.primary_team_id || row.team            || base.team || '',
      renewalDate:      row.renewal_date   || base.renewalDate     || '',
      streetAddress:    row.street_address || base.streetAddress   || '',
      city:             row.city           || base.city            || '',
      state:            row.state          || base.state           || '',
      zipCode:          row.zip_code       || base.zipCode         || '',
      mainPhone:        row.main_phone     || base.mainPhone       || '',
      taxId:            row.tax_id         || base.taxId           || '',
      natureOfBusiness: row.nature_of_business || base.natureOfBusiness || '',
      corporateStructure: row.corporate_structure || base.corporateStructure || '',
      numLocations:     row.num_locations  || base.numLocations    || '',
      payrollSystem:    row.payroll_system || base.payrollSystem   || '',
      payrollFrequency: row.payroll_frequency || base.payrollFrequency || '',
      benefitAdminSystem: row.benefit_admin_system || base.benefitAdminSystem || '',
      ratingRegion:     row.rating_region  || base.ratingRegion   || '',
      cobraVendor:      row.cobra_vendor   || base.cobraVendor    || '',
      cobraSIPaid:      row.cobra_si_paid  != null ? row.cobra_si_paid : (base.cobraSIPaid || false),
      notes:            row.notes          || base.notes           || '',
      salesPerson:      row.sales_person   || base.salesPerson    || '',
      clientStatusDate: row.status_changed_date || base.clientStatusDate || '',
      // transactions: prefer the dedicated column (most up-to-date), fall back to data blob
      transactions:     (row.transactions && row.transactions.length > 0)
                          ? row.transactions
                          : (base.transactions || []),
    }
  })
}

export async function upsertClient(clientData) {
  const row = {
    id:                   clientData.id,
    // Promoted columns — always write these from the live client data
    legal_name:           clientData.name             || '',
    name:                 clientData.name             || '',
    status:               (clientData.clientStatus    || 'Active').toLowerCase(),
    market_size:          clientData.marketSize        || '',
    market_segment:       clientData.marketSize        || '',
    employer_size:        clientData.employerSize      || '',
    employer_type:        clientData.employerType      || '',
    funding_method:       clientData.fundingMethod     || '',
    renewal_date:         clientData.renewalDate       || null,
    renewal_month:        clientData.renewalDate
                            ? parseInt(clientData.renewalDate.split('-')[1], 10)
                            : null,
    situs_state:          clientData.groupSitus        || '',
    eligible_employee_count: clientData.totalEligible
                            ? parseInt(String(clientData.totalEligible).replace(/\D/g,''), 10) || null
                            : null,
    enrolled_employee_count: clientData.medicalEnrolled
                            ? parseInt(String(clientData.medicalEnrolled).replace(/\D/g,''), 10) || null
                            : null,
    team:                 clientData.team              || '',
    primary_team_id:      clientData.team              || '',
    client_status:        clientData.clientStatus      || 'Active',
    lead:                 clientData.lead              || '',
    street_address:       clientData.streetAddress     || '',
    city:                 clientData.city              || '',
    state:                clientData.state             || '',
    zip_code:             clientData.zipCode           || '',
    main_phone:           clientData.mainPhone         || '',
    tax_id:               clientData.taxId             || '',
    nature_of_business:   clientData.natureOfBusiness  || '',
    corporate_structure:  clientData.corporateStructure || '',
    num_locations:        clientData.numLocations
                            ? parseInt(String(clientData.numLocations).replace(/\D/g,''), 10) || null
                            : null,
    payroll_system:       clientData.payrollSystem      || '',
    payroll_frequency:    clientData.payrollFrequency   || '',
    benefit_admin_system: clientData.benefitAdminSystem || '',
    rating_region:        clientData.ratingRegion       || '',
    cobra_vendor:         clientData.cobraVendor        || '',
    cobra_si_paid:        clientData.cobraSIPaid        || false,
    notes:                clientData.notes              || '',
    sales_person:         clientData.salesPerson        || '',
    status_changed_date:  clientData.clientStatusDate   || null,
    // Keep the full JSONB blob for all other fields not yet in proper columns
    data:                 clientData,
    // Also write transactions as a dedicated column for direct queries
    transactions:         clientData.transactions || [],
    updated_at:           new Date().toISOString(),
  }
  const { error } = await supabase.from('clients').upsert(row)
  if (error) console.error('upsertClient error:', error)
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) console.error('deleteClient error:', error)
}

// ── CARRIERS ─────────────────────────────────────────────────────────────────

export async function fetchCarriers() {
  const { data, error } = await supabase.from('carriers').select('*')
  if (error) { console.error('fetchCarriers error:', error); return null }
  return data.map(row => {
    // If the row has a full JSONB data column, use it (new format)
    if (row.data && typeof row.data === 'object') {
      return { ...row.data, id: row.id }
    }
    // Fall back to reading individual columns (old format)
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      category: row.category,
      segments: row.segments || [],
      products: row.products || [],
      funding: row.funding || [],
      states: row.states || [],
      notes: row.notes || '',
      requirements: row.requirements || [],
      pinned: row.pinned || false,
      contacts: row.contacts || [],
      benefitDetails: row.benefit_details || '',
    }
  })
}

export async function upsertCarrier(carrier) {
  const { error } = await supabase.from('carriers').upsert({
    id: carrier.id,
    name: carrier.name || '',
    type: carrier.type || '',
    category: carrier.category || '',
    // Store full carrier object so contacts, benefitDetails, and any
    // future fields are preserved — same pattern as clients
    data: carrier,
  })
  if (error) console.error('upsertCarrier error:', error)
}

export async function deleteCarrier(id) {
  const { error } = await supabase.from('carriers').delete().eq('id', id)
  if (error) console.error('deleteCarrier error:', error)
}

// ── TASKS ─────────────────────────────────────────────────────────────────────

export async function fetchTasks() {
  const { data, error } = await supabase.from('tasks').select('*').order('order_index')
  if (error) { console.error('fetchTasks error:', error); return null }
  return data.map(row => ({
    id: row.id,
    label: row.label,
    category: row.category,
    markets: row.markets || [],
    carriers: row.carriers || [],
    funding: row.funding || [],
    states: row.states || [],
    employerSizes: row.employer_sizes || [],
    employerTypes: row.employer_types || [],
    corpStructures: row.corp_structures || [],
    defaultAssignee: row.default_assignee || '',
    dueDateRule: row.due_date_rule || '',
    recurrence: row.recurrence || null,
    eligibilityRule: row.eligibility_rule || null,
    order: row.order_index || 0,
    isStandard: row.is_standard || false,
  }))
}

export async function upsertTask(task) {
  const { error } = await supabase.from('tasks').upsert({
    id: task.id,
    label: task.label,
    category: task.category,
    markets: task.markets || [],
    carriers: task.carriers || [],
    funding: task.funding || [],
    states: task.states || [],
    employer_sizes: task.employerSizes || [],
    employer_types: task.employerTypes || [],
    corp_structures: task.corpStructures || [],
    default_assignee: task.defaultAssignee || '',
    due_date_rule: task.dueDateRule || '',
    recurrence: task.recurrence || null,
    eligibility_rule: task.eligibilityRule || null,
    order_index: task.order || 0,
    is_standard: task.isStandard || false,
  })
  if (error) console.error('upsertTask error:', error)
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) console.error('deleteTask error:', error)
}

// ── DDR ───────────────────────────────────────────────────────────────────────

export async function fetchDDR() {
  const { data, error } = await supabase.from('ddr').select('*')
  if (error) { console.error('fetchDDR error:', error); return null }
  return data.map(row => ({
    id: row.id,
    label: row.label,
    anchor: row.anchor,
    direction: row.direction,
    days: row.days,
    builtin: row.builtin || false,
  }))
}

export async function upsertDDR(rule) {
  const { error } = await supabase.from('ddr').upsert({
    id: rule.id,
    label: rule.label,
    anchor: rule.anchor,
    direction: rule.direction,
    days: rule.days,
    builtin: rule.builtin || false,
  })
  if (error) console.error('upsertDDR error:', error)
}

export async function deleteDDR(id) {
  const { error } = await supabase.from('ddr').delete().eq('id', id)
  if (error) console.error('deleteDDR error:', error)
}

// ── MEETINGS ──────────────────────────────────────────────────────────────────

export async function fetchMeetings() {
  const { data, error } = await supabase.from('meetings').select('*').order('created_at', { ascending: false })
  if (error) { console.error('fetchMeetings error:', error); return null }
  // Use meeting_id as the app-facing id so saves and loads use the same key
  return data.map(row => {
    const base = row.data ? { ...row.data } : {}
    const appId = row.meeting_id || base.id
    return { ...base, id: appId, _dbId: row.id }
  })
}

export async function upsertMeeting(meeting) {
  const payload = {
    meeting_id: meeting.id,
    team: meeting.team || '',
    date: meeting.date || null,
    data: meeting,
    updated_at: new Date().toISOString(),
  }
  // id column is uuid (auto-generated) — never pass it from the app
  // Use meeting_id (text) to find existing rows
  const { data: existing } = await supabase
    .from('meetings').select('id').eq('meeting_id', meeting.id).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('meetings').update(payload).eq('meeting_id', meeting.id)
    if (error) console.error('upsertMeeting update error:', error)
  } else {
    const { error } = await supabase.from('meetings').insert(payload)
    if (error) console.error('upsertMeeting insert error:', error)
  }
}

export async function deleteMeeting(id) {
  // id is the app-facing meeting_id (text), not the uuid db id
  const { error } = await supabase.from('meetings').delete().eq('meeting_id', id)
  if (error) console.error('deleteMeeting error:', error)
}
// ── TEAMS ─────────────────────────────────────────────────────────────────────

const TEAM_DEFAULTS = {
  India:  { color: '#cceeff', border: '#00A2E8', text: '#006fa0' },
  Juliet: { color: '#ccf5d8', border: '#2ADB5E', text: '#1a9040' },
}

export async function fetchTeams() {
  const { data, error } = await supabase.from('teams').select('*')
  if (error) { console.error('fetchTeams error:', error); return null }
  return data.map(row => {
    const defaults = TEAM_DEFAULTS[row.id] || {}
    return {
      id: row.id,
      label: row.label,
      color: row.color || defaults.color || '#f1f5f9',
      border: row.border || defaults.border || '#94a3b8',
      text: row.text || defaults.text || '#475569',
      members: row.members || [],
      createdBy: row.created_by || '',
    }
  })
}

export async function upsertTeam(team) {
  if (!team.id) { console.error('upsertTeam: missing id', team); return; }
  const { error } = await supabase.from('teams').upsert({
    id: team.id,
    label: team.label || '',
    color: team.color || '',
    border: team.border || '',
    text: team.text || '',
    members: team.members || [],
    created_by: team.createdBy || '',
  })
  if (error) console.error('upsertTeam error:', error)
}

export async function deleteTeam(id) {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) console.error('deleteTeam error:', error)
}
// ── AUDIT LOGS ────────────────────────────────────────────────────────────────

export async function insertAuditLog(entry) {
  // Fire-and-forget — never await this, never block the UI
  // Silently swallow errors if audit_logs table doesn't exist yet
  supabase.from('audit_logs').insert({
    client_id:   entry.clientId,
    client_name: entry.clientName,
    user_name:   entry.userName,
    user_role:   entry.userRole,
    action:      entry.action || 'updated',
    changed_fields: entry.changedFields ? JSON.stringify(entry.changedFields) : null,
    category:    entry.category,
    task_label:  entry.taskLabel,
    field:       entry.field,
    old_value:   entry.oldValue != null ? String(entry.oldValue) : '',
    new_value:   entry.newValue != null ? String(entry.newValue) : '',
    timestamp:   entry.timestamp || new Date().toISOString(),
  }).then(({ error }) => {
    if (error && !error.message?.includes('does not exist')) {
      console.warn('insertAuditLog:', error.message);
    }
  }).catch(() => {}); // silently ignore network errors
}

export async function fetchAuditLogs({ clientId, userName, field, from, to } = {}) {
  let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false })
  if (clientId)  q = q.eq('client_id', clientId)
  if (userName)  q = q.eq('user_name', userName)
  if (field)     q = q.eq('field', field)
  if (from)      q = q.gte('created_at', from)
  if (to)        q = q.lte('created_at', to)
  const { data, error } = await q
  if (error) { console.error('fetchAuditLogs error:', error); return [] }
  return data
}

// ── RENEWALS ──────────────────────────────────────────────────────────────────

export async function fetchRenewalStages() {
  const { data, error } = await supabase
    .from('renewal_stages')
    .select('*')
    .order('display_order')
  if (error) { console.error('fetchRenewalStages error:', error); return [] }
  return data
}

export async function fetchRenewals({ teamId } = {}) {
  // Lean query — just the fields we need, no joins
  let q = supabase
    .from('renewals')
    .select('id, client_id, renewal_year, effective_date, team_id, status, stage_id, notes, estimated_annual_premium, estimated_annual_commission')
    .order('effective_date')

  if (teamId && teamId !== 'All') q = q.eq('team_id', teamId)

  const { data, error } = await q
  if (error) { console.error('fetchRenewals error:', error); return [] }
  return data || []
}

export async function upsertRenewal(renewal) {
  const { error } = await supabase.from('renewals').upsert({
    id:                          renewal.id,
    client_id:                   renewal.client_id,
    renewal_year:                renewal.renewal_year,
    effective_date:              renewal.effective_date,
    team_id:                     renewal.team_id || null,
    status:                      renewal.status || 'in_progress',
    stage_id:                    renewal.stage_id || null,
    notes:                       renewal.notes || null,
    estimated_annual_premium:    renewal.estimated_annual_premium || null,
    estimated_annual_commission: renewal.estimated_annual_commission || null,
    updated_at:                  new Date().toISOString(),
  })
  if (error) console.error('upsertRenewal error:', error)
}
