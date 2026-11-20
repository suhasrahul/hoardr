import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Ship the replay corpus + wants file inside the deployed functions —
  // the public URL runs the same pipeline over committed fixtures.
  outputFileTracingIncludes: {
    "/api/scan": ["./data/corpus/**/*.json", "./data/wants.json"],
    "/.well-known/workflow/v1/**": ["./data/**/*"],
  },
};

export default withWorkflow(nextConfig);
