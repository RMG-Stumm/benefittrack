import { supabase } from './supabase.js'

// ── CLIENTS ──────────────────────────────────────────────────────────────────

export async function fetchClients() {
  const { data, error } = await supabase.from('clients').select('*')
  if (error) { console.error('fetchClients error:', error); return null }
  return data.map(row => row.data ? { ...row.data, id: row.id } : row)
}

export async function upsertClient(clientData) {
  const row = {
    id: clientData.id,
    name: clientData.name || '',
    renewal_date: clientData.renewalDate || null,
    market_size: clientData.marketSize || '',
    team: clientData.team || '',
    client_status: clientData.clientStatus || 'Active',
    lead: clientData.lead || '',
    data: clientData,
    updated_at: new Date().toISOString(),
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
    defaultAssignee: row.default_assignee || '',
    dueDateRule: row.due_date_rule || '',
    recurrence: row.recurrence || null,
    eligibilityRule: row.eligibility_rule || null,
    order: row.order_index || 0,
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
    default_assignee: task.defaultAssignee || '',
    due_date_rule: task.dueDateRule || '',
    recurrence: task.recurrence || null,
    eligibility_rule: task.eligibilityRule || null,
    order_index: task.order || 0,
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
  return data
}

export async function upsertMeeting(meeting) {
  const { error } = await supabase.from('meetings').upsert(meeting)
  if (error) console.error('upsertMeeting error:', error)
}

export async function deleteMeeting(id) {
  const { error } = await supabase.from('meetings').delete().eq('id', id)
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
  const { error } = await supabase.from('audit_logs').insert({
    client_id:   entry.clientId,
    client_name: entry.clientName,
    user_name:   entry.userName,
    user_role:   entry.userRole,
    category:    entry.category,
    task_label:  entry.taskLabel,
    field:       entry.field,
    old_value:   entry.oldValue != null ? String(entry.oldValue) : '',
    new_value:   entry.newValue != null ? String(entry.newValue) : '',
  })
  if (error) console.error('insertAuditLog error:', error)
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
