import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { vol } from '../vitest.setup'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createSupabaseSkeleton, readMemFile, run } from './helpers'

describe('compile command', () => {
  const supabasePath = '/supabase'
  const flowPath = '/flow.ts'
  const denoJsonPath = '/deno.json'
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Set up basic file structure
    createSupabaseSkeleton(supabasePath)
    
    // Create a sample flow.ts file
    vol.writeFileSync(flowPath, `
      export default {
        name: 'test-flow',
        steps: {
          start: {
            type: 'start',
            next: 'end'
          },
          end: {
            type: 'end'
          }
        }
      }
    `)
    
    // Create a sample deno.json file with imports
    vol.writeFileSync(denoJsonPath, `{
      "imports": {
        "@pgflow/core": "npm:@pgflow/core"
      }
    }`)
  })
  
  it('should compile a TypeScript flow to SQL migration', async () => {
    // Arrange - files already set up in beforeEach
    
    // Act
    await run(`compile ${flowPath} --deno-json ${denoJsonPath} --supabase-path ${supabasePath}`)
    
    // Assert
    // Check if migration directory exists and contains the new migration
    const migrationsPath = `${supabasePath}/migrations`
    expect(fs.existsSync(migrationsPath)).toBe(true)
    
    const migrationFiles = fs.readdirSync(migrationsPath)
    expect(migrationFiles.length).toBe(1)
    
    // Migration file should follow naming pattern and contain SQL
    const migrationFile = migrationFiles[0]
    expect(migrationFile).toMatch(/^\d+_create_flow_flow\.sql$/)
    
    const sqlContent = readMemFile(`${migrationsPath}/${migrationFile}`)
    expect(sqlContent).toBe('/* fake SQL */')
  })
  
  it('should create migrations directory if it does not exist', async () => {
    // Arrange - start without migrations directory
    vol.rmdirSync(`${supabasePath}/migrations`, { recursive: true })
    expect(fs.existsSync(`${supabasePath}/migrations`)).toBe(false)
    
    // Act
    await run(`compile ${flowPath} --deno-json ${denoJsonPath} --supabase-path ${supabasePath}`)
    
    // Assert
    expect(fs.existsSync(`${supabasePath}/migrations`)).toBe(true)
    const migrationFiles = fs.readdirSync(`${supabasePath}/migrations`)
    expect(migrationFiles.length).toBe(1)
  })
  
  it('should use the flow filename in the migration name', async () => {
    // Arrange - create a different flow file
    const customFlowPath = '/custom-workflow.ts'
    vol.writeFileSync(customFlowPath, `
      export default {
        name: 'custom-workflow',
        steps: {
          start: { type: 'start', next: 'end' },
          end: { type: 'end' }
        }
      }
    `)
    
    // Act
    await run(`compile ${customFlowPath} --deno-json ${denoJsonPath} --supabase-path ${supabasePath}`)
    
    // Assert
    const migrationFiles = fs.readdirSync(`${supabasePath}/migrations`)
    const migrationFile = migrationFiles[0]
    expect(migrationFile).toMatch(/^\d+_create_custom-workflow_flow\.sql$/)
  })
  
  it('should default to ./supabase path if not specified', async () => {
    // Arrange - move Supabase files to current directory
    vol.rmdirSync(supabasePath, { recursive: true })
    createSupabaseSkeleton('./supabase')
    
    // Act
    await run(`compile ${flowPath} --deno-json ${denoJsonPath}`)
    
    // Assert
    expect(fs.existsSync('./supabase/migrations')).toBe(true)
    const migrationFiles = fs.readdirSync('./supabase/migrations')
    expect(migrationFiles.length).toBe(1)
  })
  
  it('should fail if flow file does not exist', async () => {
    // Arrange
    const nonExistentFlowPath = '/non-existent-flow.ts'
    
    // Act & Assert
    await expect(run(`compile ${nonExistentFlowPath} --deno-json ${denoJsonPath} --supabase-path ${supabasePath}`))
      .rejects.toThrow()
  })
  
  it('should fail if deno.json does not exist', async () => {
    // Arrange
    const nonExistentDenoJsonPath = '/non-existent-deno.json'
    
    // Act & Assert
    await expect(run(`compile ${flowPath} --deno-json ${nonExistentDenoJsonPath} --supabase-path ${supabasePath}`))
      .rejects.toThrow()
  })
})