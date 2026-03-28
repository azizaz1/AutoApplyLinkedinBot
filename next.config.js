/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
    instrumentationHook: true,
    serverComponentsExternalPackages: ["playwright", "playwright-core"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)
      config.externals = [
        ...existing,
        ({ request }, callback) => {
          const nodeBuiltins = new Set([
            "path", "fs", "crypto", "os", "stream", "http", "https",
            "url", "util", "events", "net", "tls", "dns", "child_process",
            "worker_threads", "readline", "buffer", "zlib", "assert",
            "querystring", "string_decoder", "perf_hooks", "v8", "vm",
          ])
          if (
            nodeBuiltins.has(request) ||
            request.startsWith("node:") ||
            request === "playwright" ||
            request === "playwright-core" ||
            request.startsWith("playwright/") ||
            request.startsWith("playwright-core/")
          ) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }
    return config
  },
}

module.exports = nextConfig
