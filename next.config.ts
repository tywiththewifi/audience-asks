import type { NextConfig } from "next";

const config: NextConfig = {
  images: { remotePatterns: [{ hostname: "yt3.ggpht.com" }, { hostname: "i.ytimg.com" }] },
};

export default config;
