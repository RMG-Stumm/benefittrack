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
  return data.map(row => ({
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
  }))
}

export async function upsertCarrier(carrier) {
  const { error } = await supabase.from('carriers').upsert({
    id: carrier.id,
    name: carrier.name,
    type: carrier.type,
    category: carrier.category,
    segments: carrier.segments || [],
    products: carrier.products || [],
    funding: carrier.funding || [],
    states: carrier.states || [],
    notes: carrier.notes || '',
    requirements: carrier.requirements || [],
    pinned: carrier.pinned || false,
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
  return data.map(row => row.data ? { ...row.data, id: row.id } : row)
}

export async function upsertMeeting(meeting) {
  const { error } = await supabase.from('meetings').upsert({
    id: meeting.id,
    team: meeting.team || '',
    date: meeting.date || null,
    data: meeting,
    created_at: meeting.createdAt || new Date().toISOString(),
  })
  if (error) console.error('upsertMeeting error:', error)
}

export async function deleteMeeting(id) {
  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) console.error('deleteMeeting error:', error)
}
// ── TEAMS ─────────────────────────────────────────────────────────────────────

export async function fetchTeams() {
  const { data, error } = await supabase.from('teams').select('*')
  if (error) { console.error('fetchTeams error:', error); return null }
  return data.map(row => ({
    id: row.id,
    label: row.label,
    color: row.color,
    border: row.border,
    text: row.text,
    members: row.members || [],
  }))
}

export async function upsertTeam(team) {
  const { error } = await supabase.from('teams').upsert({
    id: team.id,
    label: team.label,
    color: team.color,
    border: team.border,
    text: team.text,
    members: team.members || [],
  })
  if (error) console.error('upsertTeam error:', error)
}

export async function deleteTeam(id) {
  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) console.error('deleteTeam error:', error)
}