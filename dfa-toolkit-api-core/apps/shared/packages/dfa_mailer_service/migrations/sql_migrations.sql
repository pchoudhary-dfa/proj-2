-- SQL migration files for DFA Mailer Service
-- This can be used with FastAPI/SQLAlchemy or any other SQL-based ORM

-- Create email_templates table
CREATE TABLE IF NOT EXISTS dfa_email_templates (
    id SERIAL PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    name VARCHAR(200) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    created_by JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_template_key_language UNIQUE (template_key, language),
    CONSTRAINT check_language_length CHECK (LENGTH(language) >= 2),
    CONSTRAINT check_template_key_length CHECK (LENGTH(template_key) >= 1)
);

-- Create indexes for email_templates
CREATE INDEX IF NOT EXISTS idx_dfa_email_templates_key ON dfa_email_templates (template_key);
CREATE INDEX IF NOT EXISTS idx_dfa_email_templates_language ON dfa_email_templates (language);
CREATE INDEX IF NOT EXISTS idx_dfa_email_templates_active ON dfa_email_templates (is_active);
CREATE INDEX IF NOT EXISTS idx_dfa_email_templates_created ON dfa_email_templates (created_at);

-- Create email_logs table
CREATE TABLE IF NOT EXISTS dfa_email_logs (
    id SERIAL PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL,
    recipient_email VARCHAR(254) NOT NULL,
    recipient_name VARCHAR(200),
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    context JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT check_status_valid CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
    CONSTRAINT check_priority_valid CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    CONSTRAINT check_retry_count_positive CHECK (retry_count >= 0),
    CONSTRAINT check_max_retries_positive CHECK (max_retries >= 0),
    CONSTRAINT check_email_format CHECK (recipient_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for email_logs
CREATE INDEX IF NOT EXISTS idx_dfa_email_logs_template ON dfa_email_logs (template_key);
CREATE INDEX IF NOT EXISTS idx_dfa_email_logs_recipient ON dfa_email_logs (recipient_email);
CREATE INDEX IF NOT EXISTS idx_dfa_email_logs_status ON dfa_email_logs (status);
CREATE INDEX IF NOT EXISTS idx_dfa_email_logs_created ON dfa_email_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_dfa_email_logs_sent ON dfa_email_logs (sent_at);
CREATE INDEX IF NOT EXISTS idx_dfa_email_logs_priority ON dfa_email_logs (priority);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_dfa_email_templates_updated_at 
    BEFORE UPDATE ON dfa_email_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dfa_email_logs_updated_at 
    BEFORE UPDATE ON dfa_email_logs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Safe alter for adding created_by if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='dfa_email_templates' AND column_name='created_by'
    ) THEN
        ALTER TABLE dfa_email_templates ADD COLUMN created_by JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Safe drop of any single-column unique on template_key if it exists (name may vary by DB)
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'dfa_email_templates'
      AND tc.constraint_type = 'UNIQUE'
      AND ccu.column_name = 'template_key'
      AND tc.constraint_name <> 'unique_template_key_language';

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE dfa_email_templates DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Insert some sample email templates
INSERT INTO dfa_email_templates (template_key, language, name, subject, html_content, text_content) VALUES
('welcome', 'en', 'Welcome Email', 'Welcome to {{app_name}}!', 
 '<h1>Welcome {{user_name}}!</h1><p>Thank you for joining {{app_name}}. We are excited to have you on board!</p>',
 'Welcome {{user_name}}! Thank you for joining {{app_name}}. We are excited to have you on board!'),
 
('password_reset', 'en', 'Password Reset', 'Reset your password for {{app_name}}', 
 '<h1>Password Reset Request</h1><p>Hello {{user_name}},</p><p>Click the link below to reset your password:</p><a href="{{reset_link}}">Reset Password</a>',
 'Hello {{user_name}}, Click the link below to reset your password: {{reset_link}}'),
 
('notification', 'en', 'General Notification', '{{notification_title}}', 
 '<h1>{{notification_title}}</h1><p>{{notification_message}}</p>',
 '{{notification_title}} - {{notification_message}}')
ON CONFLICT (template_key, language) DO NOTHING;
