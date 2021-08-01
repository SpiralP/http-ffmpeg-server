const production = process.env.NODE_ENV === "production";

require("esbuild").buildSync({
  entryPoints: ["src/index.ts"],
  bundle: true,
  minify: production,
  sourcemap: true,
  platform: "node",
  target: ["node14"],
  format: "cjs",
  outfile: "dist/index.js",
  external: ["ffmpeg-static"],
});
