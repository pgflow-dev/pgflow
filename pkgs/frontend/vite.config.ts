import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import mkcert from 'vite-plugin-mkcert';

const MKCERT_HOSTS = ['localhost', '127.0.0.1'];

export default defineConfig({
	// enable console.log on production for debug purposes
	// build: {
	// 	terserOptions: {
	// 		compress: {
	// 			drop_console: false
	// 		}
	// 	}
	// },
	plugins: [
		mkcert({
			hosts: MKCERT_HOSTS
		}),
		sveltekit(),
		purgeCss({
			safelist: {
				// any selectors that begin with "hljs-" will not be purged
				greedy: [/^hljs-/]
			}
		}),
		SvelteKitPWA({
			srcDir: 'src/',
			mode: 'development',
			scope: '/',
			base: '/',
			strategies: 'generateSW',
			// strategies: 'injectManifest',
			registerType: 'autoUpdate',
			manifest: {
				short_name: 'feedwise',
				name: 'feedwise',
				start_url: '/',
				scope: '/',
				display: 'fullscreen',
				description: 'Quick capture for the busy',
				theme_color: '#1b1b27',
				background_color: '#1b1b27',
				icons: [
					{
						src: 'pwa-64x64.png',
						sizes: '64x64',
						type: 'image/png'
					},
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: 'maskable-icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				],
				display_override: ['fullscreen', 'standalone'],
				share_target: {
					action: '/feed/add-share',
					method: 'POST',
					enctype: 'multipart/form-data',
					params: {
						title: 'title',
						text: 'text',
						url: 'url',
						files: [
							{
								name: 'file',
								accept: ['*/*']
							}
						]
					}
				}
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			devOptions: {
				enabled: true,
				suppressWarnings: process.env.SUPPRESS_WARNING === 'true',
				type: 'module',
				navigateFallback: '/'
			},
			// if you have shared info in svelte config file put in a separate module and use it also here
			kit: {
				includeVersionFile: true
			}
		})
	],
	server: {
		// empty proxy option fixes following error:
		//   TypeError: Request constructor: init.headers is a symbol, which cannot be converted to a DOMString.
		proxy: {},
		https: {}
	}
});
