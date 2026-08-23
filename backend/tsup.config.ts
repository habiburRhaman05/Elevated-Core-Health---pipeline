import { defineConfig } from "tsup";

export default defineConfig({
	// index.ts = long-running server (Railway/Render/traditional hosts).
	// vercel.ts = bare Express app export, bundled to dist/vercel.js for Vercel's serverless function.
	entry: ["src/index.ts", "src/vercel.ts"],
	format: ["esm"],
	target: "node22",
	outDir: "dist",
	sourcemap: true,
	clean: true,
	bundle: true,
	splitting: false,

	external: [
		"express",
		"@prisma/client",
		"cors",
		"cookie-parser",
		"compression",
		"dotenv",
		"helmet",
		"hpp",
		"morgan",
		"events",
		"path",
		"fs",
		"url",
		"pino-pretty",
		"colorette",
	],

	outExtension({ format }) {
		if (format === "esm") return { js: ".js" };
		return {};
	},
	// Vercel needs the vercel entry to be importable
	banner: {
		js: "",
	},
});
