import type { MetadataRoute } from "next";

// Every call to the API spends YouTube quota and model tokens, so a crawler that renders a shared
// ?channel= link must not be able to start a run.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } };
}
