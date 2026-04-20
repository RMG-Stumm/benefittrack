import { createClient } from '@supabase/supabase-js'
import teamsData from './teams-backup.json' with { type: 'json' }

const supabase = createClient(
  'https://imzyimzargcuyuucwysm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltenlpbXphcmdjdXl1dWN3eXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTc1NzMsImV4cCI6MjA5MTc3MzU3M30.It492S0R9o6ek_ftESCEE7t2bNrMwMwCNJx1vFagSZY'
)

async function migrateTeams() {
  console.log(`Migrating ${teamsData.length} teams...`)
  for (const team of teamsData) {
    const { error } = await supabase.from('teams').upsert({
      id: team.id,
      label: team.label,
      color: team.color,
      border: team.border,
      text: team.text,
      members: team.members || [],
    })
    if (error) console.error(`Error: ${team.label}:`, error.message)
    else console.log(`✓ ${team.label}`)
  }
  console.log('Done!')
}

migrateTeams()