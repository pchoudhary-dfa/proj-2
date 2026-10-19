from setuptools import setup, find_packages
import os

# Read the README file
def read_readme():
    with open("README.md", "r", encoding="utf-8") as fh:
        return fh.read()

# Read requirements
def read_requirements():
    with open("requirements.txt", "r", encoding="utf-8") as fh:
        return [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="dfa-help-service",
    version="2.0.22",
    author="Community Systems Foundation",
    author_email="info@communitysystemsfoundation.org",
    description="A framework-agnostic Python package for multi-language adaptation and key management",
    long_description=read_readme(),
    long_description_content_type="text/markdown",
    url="https://git.communitysystemsfoundation.org/scm/hlp/dfa-help-service.git",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Internet :: WWW/HTTP :: HTTP Servers",
        "Framework :: Django",
        "Framework :: FastAPI",
        "Framework :: Flask",
    ],
    python_requires=">=3.8",
    install_requires=read_requirements(),
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-cov>=4.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "isort>=5.12.0",
            "mypy>=1.0.0",
            "pre-commit>=3.0.0",
        ],
        "django": [
            "django>=3.2.0",
        ],
        "fastapi": [
            "fastapi>=0.100.0",
            "uvicorn>=0.22.0",
            "pydantic>=2.0.0",
            "pydantic-settings>=2.0.0",
        ],
        "flask": [
            "flask>=2.3.0",
        ],
        "database": [
            "sqlalchemy>=2.0.0",
            "alembic>=1.11.0",
            "pymysql>=1.1.0",  # MySQL driver
            "psycopg2-binary>=2.9.0",  # PostgreSQL driver
        ],
        "cache": [
            "redis>=4.5.0",
        ],
    },
    include_package_data=True,
    zip_safe=False,
)
