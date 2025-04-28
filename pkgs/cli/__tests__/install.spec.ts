import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { vol } from '../vitest.setup'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createSupabaseSkeleton, readMemFile, run } from './helpers'

describe('install command', () => {
  const supabasePath = '/supabase'
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
  })
  
  it('should set up pgflow in a fresh Supabase project', async () => {
    // Arrange
    const { supabasePath } = createSupabaseSkeleton(supabasePath)
    
    // Act
    await run(`install --supabase-path ${supabasePath}`)
    
    // Assert
    
    // 1. Check if config.toml was updated
    const configToml = readMemFile(`${supabasePath}/config.toml`)
    expect(configToml).toContain('[pgflow]')
    expect(configToml).toContain('enabled = true')
    
    // 2. Check if migrations were copied
    const migrationsPath = `${supabasePath}/migrations`
    expect(fs.existsSync(migrationsPath)).toBe(true)
    
    // We should have multiple migration files
    const migrationFiles = fs.readdirSync(migrationsPath)
    expect(migrationFiles.length).toBeGreaterThan(0)
    
    // 3. Check if .env file was created
    const envFilePath = `${supabasePath}/functions/.env`
    expect(fs.existsSync(envFilePath)).toBe(true)
    
    const envContent = readMemFile(envFilePath)
    expect(envContent).toContain('PGFLOW_')
  })
  
  it('should be idempotent when run twice', async () => {
    // Arrange
    const { supabasePath } = createSupabaseSkeleton(supabasePath)
    
    // Act - First run
    await run(`install --supabase-path ${supabasePath}`)
    
    // Take a snapshot of the file system state after first run
    const migrationsPath = `${supabasePath}/migrations`
    const configTomlAfterFirstRun = readMemFile(`${supabasePath}/config.toml`)
    const envFileAfterFirstRun = readMemFile(`${supabasePath}/functions/.env`)
    const migrationFilesAfterFirstRun = fs.readdirSync(migrationsPath)
    
    // Act - Second run
    await run(`install --supabase-path ${supabasePath}`)
    
    // Assert
    // State after second run should be identical to state after first run
    expect(readMemFile(`${supabasePath}/config.toml`)).toBe(configTomlAfterFirstRun)
    expect(readMemFile(`${supabasePath}/functions/.env`)).toBe(envFileAfterFirstRun)
    
    const migrationFilesAfterSecondRun = fs.readdirSync(migrationsPath)
    expect(migrationFilesAfterSecondRun).toEqual(migrationFilesAfterFirstRun)
  })
  
  it('should handle case when migrations directory already exists', async () => {
    // Arrange
    const { supabasePath } = createSupabaseSkeleton(supabasePath, { createMigrationsDir: true })
    
    // Create a dummy migration file before running install
    const migrationsPath = `${supabasePath}/migrations`
    const existingMigrationFile = `${migrationsPath}/000000_existing.sql`
    vol.writeFileSync(existingMigrationFile, '-- Existing migration file')
    
    // Act
    await run(`install --supabase-path ${supabasePath}`)
    
    // Assert
    // The existing migration file should still be there
    expect(fs.existsSync(existingMigrationFile)).toBe(true)
    expect(readMemFile(existingMigrationFile)).toBe('-- Existing migration file')
    
    // And new migrations should be added
    const migrationFiles = fs.readdirSync(migrationsPath)
    expect(migrationFiles.length).toBeGreaterThan(1)
  })
})