# Building a High-Performance Rust-based Edge Worker

To create a more performant version of the Edge Worker in Rust, we'll design a system that uses Rust for the PostgreSQL polling/connection management while leveraging Deno for executing TypeScript handlers. This architecture gives us the best of both worlds: Rust's performance and Deno's JavaScript/TypeScript compatibility.

## Architecture Overview

```
┌────────────────────────────────────────────────────┐
│                   Rust Worker                       │
├────────────────────────────────────────────────────┤
│ ┌──────────────┐    ┌───────────┐    ┌───────────┐ │
│ │ PostgreSQL   │    │ Task      │    │ Deno      │ │
│ │ Connection   │───▶│ Queue &   │───▶│ Runtime   │ │
│ │ Pool         │    │ Processor │    │ Manager   │ │
│ └──────────────┘    └───────────┘    └───────────┘ │
└────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────┐
│                TypeScript Handlers                  │
│                                                     │
│  User-provided functions for task processing that   │
│  run in isolated Deno environments                  │
└────────────────────────────────────────────────────┘
```

## Key Components

1. **PostgreSQL Connection Pool**: Efficiently manages database connections
2. **Task Queue & Processor**: Polls for tasks and manages task lifecycle
3. **Deno Runtime Manager**: Spawns and manages Deno instances for TypeScript execution
4. **TypeScript Handler Interface**: Defines how user functions process tasks

## Implementation Plan

### 1. Core Rust Structure

```rust
// src/main.rs
mod config;
mod db;
mod deno;
mod poller;
mod worker;

use clap::{App, Arg};
use config::Config;
use worker::Worker;

fn main() {
    // Parse command line arguments
    let matches = App::new("edge-worker-rust")
        .version("1.0")
        .arg(Arg::with_name("config")
            .short("c")
            .long("config")
            .value_name("FILE")
            .help("Sets a custom config file")
            .takes_value(true))
        .get_matches();

    // Load configuration
    let config_path = matches.value_of("config").unwrap_or("config.toml");
    let config = Config::from_file(config_path).expect("Failed to load config");

    // Initialize the worker and start processing
    let mut worker = Worker::new(config);
    worker.start();
}
```

### 2. Database Connection Pool

```rust
// src/db.rs
use tokio_postgres::{Client, Config, NoTls};
use deadpool_postgres::{Manager, Pool};
use std::error::Error;

pub struct DbPool {
    pool: Pool,
}

impl DbPool {
    pub fn new(connection_string: &str, max_connections: usize) -> Result<Self, Box<dyn Error>> {
        let pg_config: Config = connection_string.parse()?;
        let manager = Manager::new(pg_config, NoTls);
        let pool = Pool::builder(manager)
            .max_size(max_connections)
            .build()?;

        Ok(Self { pool })
    }
    
    pub async fn get_client(&self) -> Result<deadpool_postgres::Client, Box<dyn Error>> {
        Ok(self.pool.get().await?)
    }
    
    pub async fn poll_for_tasks(&self, queue_name: &str, batch_size: i32) -> Result<Vec<Task>, Box<dyn Error>> {
        let client = self.get_client().await?;
        
        // SQL to poll for tasks using read_with_poll function
        let rows = client.query(
            "SELECT * FROM edge_worker.read_with_poll($1, 30, $2, 5, 200)",
            &[&queue_name, &batch_size]
        ).await?;
        
        // Convert rows to Task objects
        let tasks = rows.iter().map(|row| {
            Task {
                msg_id: row.get("msg_id"),
                step_slug: row.get("step_slug"),
                input: row.get("input"),
                // Other fields...
            }
        }).collect();
        
        Ok(tasks)
    }
    
    // Additional database operations...
}

#[derive(Debug, Clone)]
pub struct Task {
    pub msg_id: i64,
    pub step_slug: String,
    pub input: serde_json::Value,
    // Other task fields...
}
```

### 3. Task Poller and Processor

```rust
// src/poller.rs
use tokio::time::{self, Duration};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::db::{DbPool, Task};
use crate::deno::DenoRuntime;

pub struct TaskPoller {
    db_pool: Arc<DbPool>,
    deno_runtime: Arc<Mutex<DenoRuntime>>,
    queue_name: String,
    batch_size: i32,
    poll_interval: Duration,
    running: Arc<Mutex<bool>>,
}

impl TaskPoller {
    pub fn new(
        db_pool: Arc<DbPool>,
        deno_runtime: Arc<Mutex<DenoRuntime>>,
        queue_name: String,
        batch_size: i32,
        poll_interval_secs: u64,
    ) -> Self {
        Self {
            db_pool,
            deno_runtime,
            queue_name,
            batch_size,
            poll_interval: Duration::from_secs(poll_interval_secs),
            running: Arc::new(Mutex::new(true)),
        }
    }
    
    pub async fn start(&self) {
        let running = self.running.clone();
        
        loop {
            // Check if we should still be running
            if !*running.lock().await {
                break;
            }
            
            match self.poll_and_process().await {
                Ok(_) => (),
                Err(e) => eprintln!("Error polling for tasks: {}", e),
            }
            
            // Wait before polling again
            time::sleep(self.poll_interval).await;
        }
    }
    
    async fn poll_and_process(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Poll for tasks
        let tasks = self.db_pool
            .poll_for_tasks(&self.queue_name, self.batch_size)
            .await?;
            
        if tasks.is_empty() {
            return Ok(());
        }
        
        println!("Processing {} tasks", tasks.len());
        
        // Process each task in parallel using tokio tasks
        let mut handles = vec![];
        
        for task in tasks {
            let deno_runtime = self.deno_runtime.clone();
            let db_pool = self.db_pool.clone();
            
            let handle = tokio::spawn(async move {
                let result = {
                    let runtime = deno_runtime.lock().await;
                    runtime.execute_task(&task).await
                };
                
                match result {
                    Ok(output) => {
                        // Mark task as complete
                        let client = db_pool.get_client().await.unwrap();
                        client.execute(
                            "SELECT pgflow.complete_task($1, $2)",
                            &[&task.msg_id, &output]
                        ).await.unwrap();
                    },
                    Err(e) => {
                        // Mark task as failed
                        eprintln!("Task failed: {}", e);
                        let client = db_pool.get_client().await.unwrap();
                        client.execute(
                            "SELECT pgflow.fail_task($1, $2)",
                            &[&task.msg_id, &e.to_string()]
                        ).await.unwrap();
                    }
                }
            });
            
            handles.push(handle);
        }
        
        // Wait for all tasks to complete
        for handle in handles {
            handle.await?;
        }
        
        Ok(())
    }
    
    pub async fn stop(&self) {
        let mut running = self.running.lock().await;
        *running = false;
    }
}
```

### 4. Deno Runtime Integration

```rust
// src/deno.rs
use std::process::{Command, Stdio};
use std::io::Write;
use tempfile::NamedTempFile;
use serde_json::{json, Value};
use crate::db::Task;

pub struct DenoRuntime {
    typescript_handler_path: String,
    deno_path: String,
}

impl DenoRuntime {
    pub fn new(typescript_handler_path: String, deno_path: String) -> Self {
        Self {
            typescript_handler_path,
            deno_path,
        }
    }
    
    pub async fn execute_task(&self, task: &Task) -> Result<Value, Box<dyn std::error::Error>> {
        // Create a temporary file to hold the task data
        let mut temp_file = NamedTempFile::new()?;
        let task_data = json!({
            "msg_id": task.msg_id,
            "step_slug": task.step_slug,
            "input": task.input
        });
        
        // Write the task data to the temp file
        write!(temp_file, "{}", task_data
