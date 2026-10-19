This is a Next.js project bootstrapped with `create-next-app`.

## Getting Started

### 1. Install dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### 2. Set up environment variables

Copy the example environment file and create your own:

```bash
cp .env.example .env
```

Update the `.env` file with the required values.

### 3. Run the development server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open http://localhost:3000 with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses `next/font` to automatically optimize and load Geist, a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

* Next.js Documentation - learn about Next.js features and API.
* Learn Next.js - an interactive Next.js tutorial.

You can check out the Next.js GitHub repository - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out the Next.js deployment documentation for more details.

## OCI Test site

https://test.datamanager.dfa6.dataforall.org/en

* `build_spec_test.yaml` is the test pipeline

## For new build

```bash
docker-compose down
docker-compose build --no-cache app
docker-compose up -d
```
```
build_spec.yaml
```