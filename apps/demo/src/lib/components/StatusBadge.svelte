<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { CheckCircle2, Play, XCircle, Clock, CircleCheck, PlayCircle, XOctagon, CircleAlert } from '@lucide/svelte';

	interface Props {
		status: 'created' | 'started' | 'completed' | 'failed' | string;
		showIcon?: boolean;
		showLabel?: boolean;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		variant?: 'badge' | 'icon-only';
		disablePulse?: boolean;
	}

	let {
		status,
		showIcon = false,
		showLabel = true,
		size = 'sm',
		variant = 'badge',
		disablePulse = false
	}: Props = $props();

	// Get status info including icon, color, label, and pulse state
	const statusInfo = $derived.by(() => {
		// Normalize status (map "started" to "running" for display)
		const normalizedStatus = status === 'started' ? 'running' : status;

		// Use filled variants for large icon-only mode
		const useFilled = variant === 'icon-only' && size === 'xl';

		switch (normalizedStatus) {
			case 'running':
				return {
					icon: useFilled ? PlayCircle : Play,
					iconColor: 'text-[#5b8def]',
					bgColor: 'bg-[#3b5bdb]',
					borderColor: 'border-[#5b8def]',
					label: 'running',
					shouldPulse: true
				};
			case 'completed':
				return {
					icon: useFilled ? CircleCheck : CheckCircle2,
					iconColor: 'text-[#20a56f]',
					bgColor: 'bg-[#177a51]',
					borderColor: 'border-[#20a56f]',
					label: 'completed',
					shouldPulse: false
				};
			case 'failed':
				return {
					icon: useFilled ? XOctagon : XCircle,
					iconColor: 'text-[#f08060]',
					bgColor: 'bg-[#c94a2e]',
					borderColor: 'border-[#f08060]',
					label: 'failed',
					shouldPulse: false
				};
			case 'created':
				return {
					icon: Clock,
					iconColor: 'text-[#607b75]',
					bgColor: 'bg-[#3d524d]',
					borderColor: 'border-[#607b75]',
					label: 'created',
					shouldPulse: false
				};
			default:
				return {
					icon: Clock,
					iconColor: 'text-[#607b75]',
					bgColor: 'bg-[#3d524d]',
					borderColor: 'border-[#607b75]',
					label: status || 'unknown',
					shouldPulse: false
				};
		}
	});

	const sizeClasses = $derived.by(() => {
		switch (size) {
			case 'sm':
				return 'text-xs';
			case 'md':
				return 'text-sm';
			case 'lg':
				return 'text-base';
			default:
				return 'text-xs';
		}
	});

	const iconSizeClasses = $derived.by(() => {
		switch (size) {
			case 'sm':
				return 'w-3 h-3';
			case 'md':
				return 'w-4 h-4';
			case 'lg':
				return 'w-5 h-5';
			case 'xl':
				return 'w-8 h-8';
			default:
				return 'w-3 h-3';
		}
	});
</script>

{#if variant === 'badge'}
	<Badge
		class="{sizeClasses} text-white font-bold rounded-sm {statusInfo.bgColor} hover:{statusInfo.bgColor} {statusInfo.borderColor} {statusInfo.shouldPulse && !disablePulse ? 'badge-pulse' : ''}"
	>
		{#if showIcon}
			<svelte:component this={statusInfo.icon} class="{iconSizeClasses} mr-1" />
		{/if}
		{#if showLabel}
			{statusInfo.label}
		{/if}
	</Badge>
{:else if variant === 'icon-only'}
	<svelte:component
		this={statusInfo.icon}
		class="{iconSizeClasses} {statusInfo.iconColor} {statusInfo.shouldPulse && !disablePulse ? 'icon-pulse' : ''}"
	/>
{/if}

<style>
	/* Pulsing animation for active/running badges */
	:global(.badge-pulse) {
		animation: badge-pulse 2s ease-in-out infinite;
	}

	@keyframes badge-pulse {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.7;
			transform: scale(1.05);
		}
	}

	/* Pulsing animation for icons */
	:global(.icon-pulse) {
		animation: icon-pulse 2s ease-in-out infinite;
	}

	@keyframes icon-pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}
</style>
