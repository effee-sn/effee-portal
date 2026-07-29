/** @type {import('next').NextConfig} */
const nextConfig = {
  // BlockNote (and its Mantine deps) ship ESM that Next should transpile so the
  // resolution-plan editor bundles cleanly.
  transpilePackages: ['@blocknote/core', '@blocknote/react', '@blocknote/mantine'],
};

export default nextConfig;
