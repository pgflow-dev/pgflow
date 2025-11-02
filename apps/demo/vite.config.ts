import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	server: {
		// server.host is controlled via CLI flags (--host)
		// Regular dev: localhost only
		// dev:remote: 0.0.0.0 via --host flag

		// Hostnames for remote dev access (local network only)
		allowedHosts: ['localhost', 'pc', 'laptop']
	}
});
