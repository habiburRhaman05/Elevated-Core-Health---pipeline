module.exports = {
	apps: [
		{
			name: "ech-api",
			cwd: "/opt/ech-pipeline/backend",
			script: "dist/index.js",
			exec_mode: "fork",
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "512M",
			env_production: {
				NODE_ENV: "production",
				PORT: "8080",
				HOST: "0.0.0.0",
			},
		},
		{
			name: "ech-frontend",
			cwd: "/opt/ech-pipeline/web-dashboard",
			script: ".next/standalone/server.js",
			exec_mode: "fork",
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "768M",
			env_production: {
				NODE_ENV: "production",
				PORT: "3000",
				HOSTNAME: "127.0.0.1",
			},
		},
	],
};
