import type { NextConfig } from 'next';
const config: NextConfig = { transpilePackages: ['@drillex/shared'], output: 'standalone' };
export default config;
