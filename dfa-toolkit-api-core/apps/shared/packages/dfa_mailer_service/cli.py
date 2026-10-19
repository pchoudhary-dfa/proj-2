"""
Command line interface for DFA Mailer Service
"""

import argparse
import sys
import logging
from typing import Optional

from .core.config import EmailConfig
from .adapters.django_adapter import MailerDjangoAdapter
from .adapters.fastapi_adapter import FastAPIAdapter

logger = logging.getLogger(__name__)


def setup_logging(verbose: bool = False):
    """Setup logging configuration"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )


def run_celery_worker(args):
    """Run Celery worker"""
    from celery import Celery
    from .tasks.email_tasks import celery_app
    
    # Configure Celery
    config = EmailConfig.from_env()
    celery_app.conf.update(
        broker_url=config.celery_broker_url,
        result_backend=config.celery_result_backend,
    )
    
    # Start worker
    celery_app.worker_main([
        'worker',
        '--loglevel=info',
        '--concurrency=4',
        f'--queues={getattr(config, "celery_queue_name", "dfa_mailer_service")}'
    ])


def run_celery_beat(args):
    """Run Celery beat scheduler"""
    from celery import Celery
    from .tasks.email_tasks import celery_app
    
    # Configure Celery
    config = EmailConfig.from_env()
    celery_app.conf.update(
        broker_url=config.celery_broker_url,
        result_backend=config.celery_result_backend,
    )
    
    # Start beat
    celery_app.control.start_beat()


def test_email_config(args):
    """Test email configuration"""
    try:
        config = EmailConfig.from_env()
        if config.validate():
            print("✅ Email configuration is valid")
            print(f"SMTP Host: {config.smtp_host}")
            print(f"SMTP Port: {config.smtp_port}")
            print(f"From Email: {config.from_email}")
            print(f"From Name: {config.from_name}")
            print(f"Use TLS: {config.use_tls}")
            print(f"BG_JOB_MQ_TYPE: {config.bg_job_mq_type}")
            print(f"BG_JOB_POLLER_ENABLED: {config.bg_job_poller_enabled}")
        else:
            print("❌ Email configuration is invalid")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Error validating email configuration: {e}")
        sys.exit(1)


def send_test_email(args):
    """Send a test email"""
    try:
        config = EmailConfig.from_env()
        
        # Determine adapter type
        if args.adapter == 'django':
            adapter = MailerDjangoAdapter(config)
        elif args.adapter == 'fastapi':
            adapter = FastAPIAdapter(config, args.database_url)
        else:
            print("❌ Invalid adapter type. Use 'django' or 'fastapi'")
            sys.exit(1)
        
        email_service = adapter.get_email_service()
        
        # Send test email
        success = email_service.send_email_sync(
            template_key='welcome',
            recipient_email=args.recipient,
            context={
                'user_name': 'Test User',
                'app_name': 'DFA Mailer Service'
            },
            language='en'
        )
        
        if success:
            print(f"✅ Test email sent successfully to {args.recipient}")
        else:
            print(f"❌ Failed to send test email to {args.recipient}")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Error sending test email: {e}")
        sys.exit(1)


def create_migrations(args):
    """Create database migrations"""
    try:
        if args.adapter == 'django':
            adapter = MailerDjangoAdapter()
            adapter.run_migrations()
            print("✅ Django migrations created successfully")
        elif args.adapter == 'fastapi':
            adapter = FastAPIAdapter(database_url=args.database_url)
            adapter.run_migrations()
            print("✅ FastAPI migrations created successfully")
        else:
            print("❌ Invalid adapter type. Use 'django' or 'fastapi'")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Error creating migrations: {e}")
        sys.exit(1)


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="DFA Mailer Service CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run Celery worker
  dfa-mailer worker

  # Run Celery beat scheduler
  dfa-mailer beat

  # Test email configuration
  dfa-mailer test-config

  # Send test email
  dfa-mailer test-email --recipient user@example.com --adapter django

  # Create migrations
  dfa-mailer migrate --adapter django
        """
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Worker command
    worker_parser = subparsers.add_parser('worker', help='Run Celery worker')
    
    # Beat command
    beat_parser = subparsers.add_parser('beat', help='Run Celery beat scheduler')
    
    # Test config command
    test_config_parser = subparsers.add_parser('test-config', help='Test email configuration')
    
    # Test email command
    test_email_parser = subparsers.add_parser('test-email', help='Send test email')
    test_email_parser.add_argument(
        '--recipient',
        required=True,
        help='Recipient email address'
    )
    test_email_parser.add_argument(
        '--adapter',
        choices=['django', 'fastapi'],
        required=True,
        help='Adapter type to use'
    )
    test_email_parser.add_argument(
        '--database-url',
        help='Database URL (required for FastAPI)'
    )
    
    # Migrate command
    migrate_parser = subparsers.add_parser('migrate', help='Create database migrations')
    migrate_parser.add_argument(
        '--adapter',
        choices=['django', 'fastapi'],
        required=True,
        help='Adapter type to use'
    )
    migrate_parser.add_argument(
        '--database-url',
        help='Database URL (required for FastAPI)'
    )
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.verbose)
    
    # Execute command
    if args.command == 'worker':
        run_celery_worker(args)
    elif args.command == 'beat':
        run_celery_beat(args)
    elif args.command == 'test-config':
        test_email_config(args)
    elif args.command == 'test-email':
        send_test_email(args)
    elif args.command == 'migrate':
        create_migrations(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
