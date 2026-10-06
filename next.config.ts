import type { NextConfig } from "next";

// Render (plan free, 512 MB) se queda sin memoria en el type-check de `next build`.
// `npm run typecheck` ya corre antes de cada commit; sólo se saltea acá (Render define RENDER=true).
const onRender = process.env.RENDER === "true";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: onRender },
  allowedDevOrigins: [
    "192.168.0.80",
    "192.168.56.1",
    "192.168.0.21", // IP real de Wi-Fi
    "192.168.0.24", // IP actual de la PC en la red (la que se usa desde el celu)
    "localhost:3000"
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" }, // avatares de Google
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;