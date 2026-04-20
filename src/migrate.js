import { createClient } from '@supabase/supabase-js'
import clientsData from './benefittrack-backup.json' with { type: 'json' }

const supabase = createClient(
  'https://imzyimzargcuyuucwysm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltenlpbXphcmdjdXl1dWN3eXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTc1NzMsImV4cCI6MjA5MTc3MzU3M30.It492S0R9o6ek_ftESCEE7t2bNrMwMwCNJx1vFagSZY'
)

async function migrateClients() {
  console.log(`Migrating ${clientsData.length} clients...`)
  for (const client of clientsData) {
    const row = {
      id: client.id,
      name: client.name || '',
      renewal_date: client.renewalDate || null,
      market_size: client.marketSize || '',
      team: client.team || '',
      client_status: client.clientStatus || 'Active',
      lead: client.lead || '',
      data: client,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('clients').upsert(row)
    if (error) console.error(`Error: ${client.name}:`, error.message)
    else console.log(`✓ ${client.name}`)
  }
  console.log('Done!')
}

migrateClients()