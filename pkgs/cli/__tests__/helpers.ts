import { vol } from '../vitest.setup'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { program } from '../src/index.js'

/**
 * Creates a basic Supabase project structure in the in-memory filesystem
 */
export function createSupabaseSkeleton(supabasePath: string = '/supabase', options: any = {}) {
  // Ensure the directory exists
  vol.mkdirSync(supabasePath, { recursive: true })
  
  // Create default config.toml with minimal content
  const configToml = options.configToml || `# This is a sample config.toml file

[api]
enabled = true
port = 54321
  
[db]
port = 54322

[studio]
enabled = true
port = 54323

# pgflow settings will be added here during install
`

  vol.writeFileSync(`${supabasePath}/config.toml`, configToml)
  
  // Create directory structure
  vol.mkdirSync(`${supabasePath}/functions`, { recursive: true })
  
  // Create migrations directory if specified in options
  if (options.createMigrationsDir) {
    vol.mkdirSync(`${supabasePath}/migrations`, { recursive: true })
  }

  return { supabasePath }
}

/**
 * Helper to read a file from the memfs filesystem
 */
export function readMemFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

/**
 * Runs the CLI command with the given arguments
 */
export async function run(args: string): Promise<void> {
  // Split the arguments string into an array
  const argsArray = ['node', 'pgflow', ...args.split(' ').filter(Boolean)]
  
  // Use Commander's parseAsync directly
  try {
    // Mock console.log to prevent banner output
    const originalConsoleLog = console.log
    console.log = vi.fn()
    
    await program.parseAsync(argsArray)
    
    // Restore console.log
    console.log = originalConsoleLog
    
    return Promise.resolve()
  } catch (error) {
    return Promise.reject(error)
  }
}

/**
 * Creates a Supabase project with PGFlow migrations
 */
export function createProjectWithMigrations(supabasePath: string = '/supabase') {
  createSupabaseSkeleton(supabasePath)
  
  // Create migrations directory
  const migrationsDir = `${supabasePath}/migrations`
  vol.mkdirSync(migrationsDir, { recursive: true })
  
  // Create some sample migrations
  const sampleMigrations = [
    '000000_schema.sql',
    '000005_create_flow.sql',
    '000010_add_step.sql'
  ]
  
  sampleMigrations.forEach(filename => {
    vol.writeFileSync(
      `${migrationsDir}/${filename}`,
      `-- Sample migration for ${filename}\nCREATE TABLE IF NOT EXISTS example (id SERIAL PRIMARY KEY);`
    )
  })
  
  return { supabasePath, migrationsDir }
}