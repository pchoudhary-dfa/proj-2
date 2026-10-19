#!/bin/bash

echo "Building DFA Help Service package..."

# Clean previous build
npm run clean

# Install dependencies if not already installed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the package
echo "Building package..."
npm run build

echo "Build complete! Check the dist/ folder for output files."
