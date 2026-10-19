# Compute Engine Usage Guide

A comprehensive step-by-step guide for understanding and testing the DFA Compute Engine system.

## Table of Contents
1. [System Overview](#system-overview)
2. [Database Schema](#database-schema)
3. [Formula Types & Operations](#formula-types--operations)
4. [Step-by-Step Workflows](#step-by-step-workflows)
5. [API Reference](#api-reference)
6. [Testing & Verification](#testing--verification)
7. [Troubleshooting](#troubleshooting)

## System Overview

The Compute Engine is a background processing system that performs mathematical operations on data warehouse indicators. It supports four types of computations:

- **TOTAL**: Sum multiple indicators
- **PERCENT**: Calculate ratios between indicators  
- **MINUS**: Subtract one indicator from another
- **TIME**: Aggregate data across time periods

### Key Components
- **Formula Management**: Define computation rules
- **Process Orchestration**: Execute computations in batches
- **Background Jobs**: Celery/DB-based async processing
- **Execution Logging**: Track progress and results

## Database Schema

### Core Tables (in Data Warehouse)

#### Formula Definition Tables
```sql
-- TOTAL formulas: Sum multiple source indicators
ce_ius_compute_add_targets  -- Target indicator definitions
ce_ius_compute_add_sources  -- Source indicators to sum

-- PERCENT formulas: Calculate ratios
ce_ius_compute_div          -- Numerator/denominator pairs

-- MINUS formulas: Subtraction operations  
ce_ius_compute_minus        -- Minuend/subtrahend pairs

-- TIME formulas: Temporal aggregations
ce_ius_compute_time         -- Time period mappings
```

#### Process Management Tables
```sql
-- Process definitions and executions
ce_process_master           -- Process definitions
ce_process_time            -- Process execution instances
ce_process_time_log        -- Individual job logs

-- Dynamic log tables (created at runtime)
ce_process_time_log_{log_id}_details  -- Detailed job execution logs
```

### Table Relationships

```
ce_process_master (1) ──→ (N) ce_process_time
                                    │
                                    ├─→ (N) ce_process_time_log
                                    │
                                    └─→ (1) ce_process_time_log_{id}_details

Formula Tables ──→ Reference IUS combinations via:
                   - dw_id (data warehouse ID)
                   - i_gid, u_gid, s_gid (indicator/unit/subgroup GIDs)
```

## Formula Types & Operations

### 1. TOTAL Operation
**Purpose**: Sum multiple source indicators into a target indicator

**Formula**: `Target = Source1 + Source2 + ... + SourceN`

**Tables Used**:
- `ce_ius_compute_add_targets`: Defines target indicator
- `ce_ius_compute_add_sources`: Lists source indicators to sum

**Example**: Total Population = Male Population + Female Population

### 2. PERCENT Operation  
**Purpose**: Calculate percentage/ratio between two indicators

**Formula**: `Result = (Numerator / Denominator) × 100`

**Tables Used**:
- `ce_ius_compute_div`: Defines numerator/denominator pairs

**Example**: Literacy Rate = (Literate Population / Total Population) × 100

### 3. MINUS Operation
**Purpose**: Subtract one indicator from another

**Formula**: `Result = Minuend - Subtrahend`

**Tables Used**:
- `ce_ius_compute_minus`: Defines minuend/subtrahend pairs

**Example**: Net Migration = Immigration - Emigration

### 4. TIME Operation
**Purpose**: Aggregate data across time periods

**Formula**: Various (sum, average, etc.) across time periods

**Tables Used**:
- `ce_ius_compute_time`: Defines time period mappings

**Example**: Annual Total = Q1 + Q2 + Q3 + Q4

## Step-by-Step Workflows

### Workflow 1: Creating a TOTAL Formula

#### Step 1: Validate Target IUS
**API Call**: `GET /dw/{dw_id}/compute-settings/validate/{ius_gid}`

**Purpose**: Ensure the target indicator exists and is valid for computation

**Database Check**: Queries `ut_ius` table to verify IUS combination exists

```bash
# Example API call
curl -X GET "http://localhost:8000/dw/1/compute-settings/validate/IND001_UNIT001_SG001" \
  -H "Authorization: Bearer {token}"
```

**Expected Response**:
```json
{
  "success": true,
  "message": "IUS validation successful",
  "data": {
    "is_valid": true,
    "ius_details": {
      "indicator_name": "Total Population",
      "unit_name": "Persons",
      "subgroup_name": "All"
    }
  }
}
```

#### Step 2: Check for Existing Formula
**API Call**: `GET /dw/{dw_id}/compute-settings/iusCheck/{ius_gid}`

**Purpose**: Verify if a formula already exists for this IUS

**Database Check**: Queries all formula tables to check for existing definitions

```bash
curl -X GET "http://localhost:8000/dw/1/compute-settings/iusCheck/IND001_UNIT001_SG001" \
  -H "Authorization: Bearer {token}"
```

#### Step 3: Resolve Source IUS Names
**API Call**: `POST /dw/{dw_id}/compute-settings/resolve-names`

**Purpose**: Get human-readable names for source indicators

```bash
curl -X POST "http://localhost:8000/dw/1/compute-settings/resolve-names" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "ius_gids": ["IND002_UNIT001_SG001", "IND003_UNIT001_SG001"]
  }'
```

#### Step 4: Save TOTAL Formula
**API Call**: `POST /dw/{dw_id}/compute-settings/save/total`

**Purpose**: Create the TOTAL formula definition

```bash
curl -X POST "http://localhost:8000/dw/1/compute-settings/save/total" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "target_ius": "IND001_UNIT001_SG001",
    "sources": [
      {
        "type": "ius",
        "ius_gid": "IND002_UNIT001_SG001"
      },
      {
        "type": "ius", 
        "ius_gid": "IND003_UNIT001_SG001"
      }
    ]
  }'
```

**Database Changes**:
1. **Insert into `ce_ius_compute_add_targets`**:
   ```sql
   INSERT INTO ce_ius_compute_add_targets 
   (dw_id, i_gid, u_gid, s_gid, execution_type, order, created_at)
   VALUES (1, 'IND001', 'UNIT001', 'SG001', 'MANUAL', 1, NOW());
   ```

2. **Insert into `ce_ius_compute_add_sources`** (for each source):
   ```sql
   INSERT INTO ce_ius_compute_add_sources 
   (dw_id, target_i_gid, target_u_gid, target_s_gid, source_i_gid, source_u_gid, source_s_gid, order)
   VALUES (1, 'IND001', 'UNIT001', 'SG001', 'IND002', 'UNIT001', 'SG001', 1);
   ```

**Verification**: Query the tables to confirm formula creation
```sql
-- Check target was created
SELECT * FROM ce_ius_compute_add_targets 
WHERE dw_id = 1 AND i_gid = 'IND001' AND u_gid = 'UNIT001' AND s_gid = 'SG001';

-- Check sources were created  
SELECT * FROM ce_ius_compute_add_sources 
WHERE dw_id = 1 AND target_i_gid = 'IND001';
```

### Workflow 2: Creating and Executing a Process

#### Step 1: Create Process Definition
**API Call**: `POST /dw/{dw_id}/process`

**Purpose**: Define a process that will execute multiple formulas

```bash
curl -X POST "http://localhost:8000/dw/1/process" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "process_name": "Monthly Population Calculation",
    "description": "Calculate total population from demographic components",
    "execution_type": "MANUAL"
  }'
```

**Database Changes**:
```sql
-- Insert into ce_process_master
INSERT INTO ce_process_master 
(dw_id, process_name, description, execution_type, created_at, created_by)
VALUES (1, 'Monthly Population Calculation', 'Calculate total...', 'MANUAL', NOW(), 'user123');
```

**Response**: Returns `process_id` for next steps

#### Step 2: Get Process Estimate  
**API Call**: `GET /dw/{dw_id}/process/{process_id}/estimate`

**Purpose**: Estimate execution time and job count

```bash
curl -X GET "http://localhost:8000/dw/1/process/1/estimate" \
  -H "Authorization: Bearer {token}"
```

**Database Operations**: 
- Counts formulas that match process criteria
- Estimates based on data volume and formula complexity

#### Step 3: Execute Process
**API Call**: `POST /dw/{dw_id}/execute/{process_id}`

**Purpose**: Start the computation process

```bash
curl -X POST "http://localhost:8000/dw/1/execute/1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "time_periods": ["2024-01", "2024-02", "2024-03"],
    "areas": ["AREA001", "AREA002"]
  }'
```

**Database Changes & Background Job Flow**:

1. **Insert Process Time Record**:
   ```sql
   INSERT INTO ce_process_time 
   (process_id, dw_id, status, started_at, time_periods, areas)
   VALUES (1, 1, 'PENDING', NOW(), '2024-01,2024-02,2024-03', 'AREA001,AREA002');
   ```

2. **Dispatch CreateJobs Task**:
   - **Queue**: `compute_create_jobs`
   - **Task**: `create_jobs_task`
   - **Payload**: `{"process_time_id": 1, "dw_id": 1}`

3. **CreateJobs Task Execution**:
   - Creates `ce_process_time_log` record
   - Creates dynamic log table: `ce_process_time_log_{log_id}_details`
   - Counts and dispatches individual computation jobs

4. **Individual Computation Jobs**:
   - **Queues**: `compute_process` (TOTAL, PERCENT, TIME, MINUS)
   - **Tasks**: `process_compute_total_task`, etc.
   - Each job processes one formula for specific time/area combination

#### Step 4: Monitor Execution
**API Call**: `GET /dw/{dw_id}/process/{process_id}/status`

**Purpose**: Check execution progress

```bash
curl -X GET "http://localhost:8000/dw/1/process/1/status" \
  -H "Authorization: Bearer {token}"
```

**Database Queries**:
```sql
-- Get overall process status
SELECT pt.*, pm.process_name 
FROM ce_process_time pt
JOIN ce_process_master pm ON pt.process_id = pm.id
WHERE pt.id = 1;

-- Get job progress
SELECT 
  status,
  COUNT(*) as count,
  (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM ce_process_time_log WHERE process_time_id = 1)) as percentage
FROM ce_process_time_log 
WHERE process_time_id = 1 
GROUP BY status;
```

### Workflow 3: Detailed Job Monitoring

#### Step 1: Get Execution Logs
**API Call**: `GET /dw/{dw_id}/time-logs/{process_time_id}`

**Purpose**: View all jobs for a process execution

```bash
curl -X GET "http://localhost:8000/dw/1/time-logs/1" \
  -H "Authorization: Bearer {token}"
```

#### Step 2: Get Detailed Job Logs
**API Call**: `GET /dw/{dw_id}/log-details/{log_id}`

**Purpose**: View detailed execution steps for a specific job

```bash
curl -X GET "http://localhost:8000/dw/1/log-details/123" \
  -H "Authorization: Bearer {token}"
```

**Database Query**:
```sql
-- Query dynamic log table
SELECT * FROM ce_process_time_log_123_details 
ORDER BY created_at ASC;
```

**Log Entry Examples**:
```json
[
  {
    "step": "VALIDATION",
    "message": "Validating source data availability",
    "status": "SUCCESS",
    "created_at": "2024-01-15T10:00:00Z"
  },
  {
    "step": "CALCULATION", 
    "message": "Computing TOTAL: 1500 + 2300 = 3800",
    "status": "SUCCESS",
    "created_at": "2024-01-15T10:00:05Z"
  },
  {
    "step": "STORAGE",
    "message": "Stored result in ut_data table",
    "status": "SUCCESS", 
    "created_at": "2024-01-15T10:00:10Z"
  }
]
```

## API Reference

### Formula Management Endpoints

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| POST | `/dw/{dw_id}/compute-settings/save/total` | Create TOTAL formula | `{target_ius, sources}` |
| POST | `/dw/{dw_id}/compute-settings/save/percent` | Create PERCENT formula | `{target_ius, numerator_ius, denominator_ius, execution_type}` |
| POST | `/dw/{dw_id}/compute-settings/save/minus` | Create MINUS formula | `{target_ius, minuend_ius, subtrahend_ius, execution_type}` |
| POST | `/dw/{dw_id}/compute-settings/save/time` | Create TIME formula | `{target_ius, source_time_periods, target_time_period, operation_type}` |
| GET | `/dw/{dw_id}/compute-settings/iusCheck/{ius_gid}` | Check existing formula | - |
| POST | `/dw/{dw_id}/compute-settings/destroy` | Delete formula | `{ius_gid, formula_type}` |

### Process Management Endpoints

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| GET | `/dw/{dw_id}/process` | List processes | - |
| POST | `/dw/{dw_id}/process` | Create process | `{process_name, description, execution_type}` |
| DELETE | `/dw/{dw_id}/process/{process_id}` | Delete process | - |
| POST | `/dw/{dw_id}/execute/{process_id}` | Execute process | `{time_periods, areas}` |
| GET | `/dw/{dw_id}/process/{process_id}/status` | Get status | - |
| GET | `/dw/{dw_id}/process/{process_id}/estimate` | Get estimate | - |

### Execution Logs Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/dw/{dw_id}/logs` | All execution logs |
| GET | `/dw/{dw_id}/logs/{process_id}` | Logs by process |
| GET | `/dw/{dw_id}/time-logs/{process_time_id}` | Logs by execution |
| GET | `/dw/{dw_id}/log-details/{log_id}` | Detailed job logs |

## Testing & Verification

### 1. Formula Creation Test

**Test TOTAL Formula Creation**:
```bash
# 1. Create formula
curl -X POST "http://localhost:8000/dw/1/compute-settings/save/total" \
  -H "Content-Type: application/json" \
  -d '{
    "target_ius": "TEST_TOTAL_UNIT001_SG001",
    "sources": [
      {
        "type": "ius",
        "ius_gid": "SRC1_UNIT001_SG001"
      },
      {
        "type": "ius",
        "ius_gid": "SRC2_UNIT001_SG001"
      }
    ]
  }'

# 2. Verify in database
SELECT * FROM ce_ius_compute_add_targets WHERE i_gid = 'TEST_TOTAL';
SELECT * FROM ce_ius_compute_add_sources WHERE target_i_gid = 'TEST_TOTAL';
```

### 2. Process Execution Test

**Complete Process Test**:
```bash
# 1. Create process
PROCESS_RESPONSE=$(curl -X POST "http://localhost:8000/dw/1/process" \
  -H "Content-Type: application/json" \
  -d '{"process_name": "Test Process", "description": "Test", "execution_type": "MANUAL"}')

PROCESS_ID=$(echo $PROCESS_RESPONSE | jq -r '.data.process_id')

# 2. Execute process  
curl -X POST "http://localhost:8000/dw/1/execute/$PROCESS_ID" \
  -H "Content-Type: application/json" \
  -d '{"time_periods": ["2024-01"], "areas": ["TEST_AREA"]}'

# 3. Monitor status
curl -X GET "http://localhost:8000/dw/1/process/$PROCESS_ID/status"
```

### 3. Background Job Verification

**Check Celery/DB Job Processing**:

1. **Monitor Job Queue**:
   ```sql
   -- Check system_bg_job_queue for pending jobs
   SELECT * FROM system_bg_job_queue 
   WHERE job_type LIKE 'compute_%' 
   ORDER BY created_at DESC;
   ```

2. **Monitor Job Execution**:
   ```sql
   -- Check process time logs
   SELECT 
     ptl.*,
     CASE 
       WHEN ptl.status = 'COMPLETED' THEN 'SUCCESS'
       WHEN ptl.status = 'FAILED' THEN 'ERROR'  
       ELSE 'PENDING'
     END as job_status
   FROM ce_process_time_log ptl
   WHERE ptl.process_time_id = {process_time_id}
   ORDER BY ptl.created_at DESC;
   ```

3. **Check Computation Results**:
   ```sql
   -- Verify results were stored in ut_data
   SELECT * FROM ut_data 
   WHERE i_gid = 'TEST_TOTAL' 
   AND time_period = '2024-01' 
   AND area_gid = 'TEST_AREA'
   ORDER BY modified_at DESC;
   ```

### 4. Error Handling Test

**Test Error Scenarios**:

1. **Invalid IUS Test**:
   ```bash
   curl -X GET "http://localhost:8000/dw/1/compute-settings/validate/INVALID_IUS"
   # Should return validation error
   ```

2. **Missing Source Data Test**:
   ```bash
   # Execute process with IUS that has no source data
   # Check log details for "SOURCE_DATA_MISSING" errors
   ```

3. **Division by Zero Test**:
   ```bash
   # Create PERCENT formula with denominator that could be zero
   # Execute and check for "DIVISION_BY_ZERO" error handling
   ```

## Troubleshooting

### Common Issues

#### 1. Jobs Stuck in PENDING Status
**Symptoms**: Process shows jobs created but no progress

**Diagnosis**:
```sql
SELECT COUNT(*) FROM ce_process_time_log WHERE status = 'PENDING';
```

**Solutions**:
- Check Celery worker status: `celery -A apps.shared.config.celery_config inspect active`
- Verify queue configuration in `celery_config.py`
- Check database connection for background jobs

#### 2. Formula Not Found Errors
**Symptoms**: "No formula found for IUS" errors in logs

**Diagnosis**:
```sql
-- Check if formula exists
SELECT 'TOTAL' as type, COUNT(*) as count FROM ce_ius_compute_add_targets WHERE i_gid = 'YOUR_IUS'
UNION ALL
SELECT 'PERCENT', COUNT(*) FROM ce_ius_compute_div WHERE target_i_gid = 'YOUR_IUS'
UNION ALL  
SELECT 'MINUS', COUNT(*) FROM ce_ius_compute_minus WHERE target_i_gid = 'YOUR_IUS'
UNION ALL
SELECT 'TIME', COUNT(*) FROM ce_ius_compute_time WHERE target_i_gid = 'YOUR_IUS';
```

**Solutions**:
- Verify formula was created correctly
- Check IUS GID format (should be `INDICATOR_UNIT_SUBGROUP`)
- Ensure `dw_id` matches between formula and execution

#### 3. Source Data Missing Errors
**Symptoms**: "Source data not available" in job logs

**Diagnosis**:
```sql
-- Check source data availability
SELECT * FROM ut_data 
WHERE i_gid IN ('SOURCE1', 'SOURCE2') 
AND time_period = 'YOUR_PERIOD'
AND area_gid = 'YOUR_AREA';
```

**Solutions**:
- Import source data before running computations
- Verify time period and area combinations exist
- Check data import logs for errors

### Performance Monitoring

#### Monitor Job Processing Rate
```sql
-- Jobs completed per hour
SELECT 
  DATE_FORMAT(completed_at, '%Y-%m-%d %H:00:00') as hour,
  COUNT(*) as jobs_completed
FROM ce_process_time_log 
WHERE status = 'COMPLETED'
AND completed_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY DATE_FORMAT(completed_at, '%Y-%m-%d %H:00:00')
ORDER BY hour;
```

#### Monitor Error Rates
```sql
-- Error rate by job type  
SELECT 
  job_type,
  COUNT(*) as total_jobs,
  SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_jobs,
  (SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as error_rate
FROM ce_process_time_log 
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY job_type;
```

## Advanced Usage

### Batch Formula Creation
For bulk formula setup, use the API endpoints in loops or create database scripts:

```sql
-- Example: Create multiple TOTAL formulas
INSERT INTO ce_ius_compute_add_targets (dw_id, i_gid, u_gid, s_gid, execution_type, order)
SELECT 1, target_indicator, 'PERSONS', 'ALL', 'AUTOMATIC', 1
FROM your_indicator_mapping_table;
```

### Custom Time Aggregations
For complex time period mappings:

```sql
-- Example: Quarterly to Annual aggregation
INSERT INTO ce_ius_compute_time (dw_id, target_i_gid, target_u_gid, target_s_gid, 
                                source_time_period, target_time_period, operation_type)
VALUES 
(1, 'ANNUAL_TOTAL', 'PERSONS', 'ALL', '2024-Q1,2024-Q2,2024-Q3,2024-Q4', '2024', 'SUM');
```

### Process Scheduling
For automated execution, integrate with your scheduling system:

```bash
# Example cron job for monthly execution
0 2 1 * * curl -X POST "http://localhost:8000/dw/1/execute/1" \
  -H "Content-Type: application/json" \
  -d "{\"time_periods\": [\"$(date +%Y-%m)\"], \"areas\": [\"ALL\"]}"
```

---

This guide provides a complete framework for understanding, implementing, and troubleshooting the Compute Engine system. Follow the workflows step-by-step to ensure proper system operation and data integrity.