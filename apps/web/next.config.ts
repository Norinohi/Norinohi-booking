import "@yacht-charter/env/web";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.trycloudflare.com"],
};

export default withNextIntl(nextConfig);
