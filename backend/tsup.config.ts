import { defineConfig } from "tsup";

export default defineConfig({
<<<<<<< Updated upstream
  entry: ["src/index.ts", "src/vercel.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  bundle: true,
  splitting: false,
=======
	// index.ts = long-running server (Railway/Render/traditional hosts).
	// vercel-handler.ts = bare Express app export for Vercel's serverless functions.
	entry: ["src/index.ts", "src/vercel-handler.ts"],
	format: ["esm"],
	target: "node22",
	outDir: "dist",
	sourcemap: true,
	clean: true,
	bundle: true,
	splitting: false,
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
  outExtension({ format }) {
    if (format === "esm") return { js: ".js" };
    return {};
  },
  // Vercel needs the vercel entry to be importable
  banner: {
    js: "",
  },
});
=======
	outExtension({ format }) {
		if (format === "esm") return { js: ".js" };
		return {};
	},
});
>>>>>>> Stashed changes
