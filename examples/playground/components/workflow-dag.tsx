'use client';

import React from 'react';
import { StepStateRow } from '@/lib/db';

interface WorkflowDagProps {
  className?: string;
  stepStates?: StepStateRow[];
}

export default function WorkflowDag({ className = '', stepStates = [] }: WorkflowDagProps) {
  // Function to get status color for a step
  const getNodeColors = (stepSlug: string) => {
    const step = stepStates.find(s => s.step_slug === stepSlug);
    
    // Return default styling if no step data is found
    if (!step) {
      return {
        fill: "fill-gray-500/20",
        stroke: "stroke-gray-500",
        animationClass: ""
      };
    }

    // Get status
    const status = step.status;
    
    // Get latestTask attempts if available
    const isRetrying = (step.attempts_count && step.attempts_count > 1) && status === 'started';

    // Determine color based on status
    if (status === 'completed') {
      return {
        fill: "fill-green-500/20",
        stroke: "stroke-green-500",
        animationClass: ""
      };
    } else if (isRetrying) {
      return {
        fill: "fill-red-500/10",
        stroke: "stroke-red-500",
        animationClass: "animate-pulse"
      };
    } else if (status === 'started') {
      return {
        fill: "fill-yellow-500/20",
        stroke: "stroke-yellow-500",
        animationClass: "animate-pulse"
      };
    } else if (status === 'failed') {
      return {
        fill: "fill-red-500/20",
        stroke: "stroke-red-500",
        animationClass: ""
      };
    } else {
      // default for created or any other status
      return {
        fill: "fill-blue-500/10",
        stroke: "stroke-blue-500/60",
        animationClass: ""
      };
    }
  };

  // Get colors for each node
  const websiteColors = getNodeColors('website');
  const sentimentColors = getNodeColors('sentiment');
  const tagsColors = getNodeColors('tags');
  const summaryColors = getNodeColors('summary');
  const saveToDbColors = getNodeColors('saveToDb');

  // Get edge colors based on source node status
  const getEdgeColor = (sourceSlug: string) => {
    const step = stepStates.find(s => s.step_slug === sourceSlug);
    if (!step) return "stroke-gray-300";
    
    switch (step.status) {
      case 'completed':
        return "stroke-green-500";
      case 'started':
        return "stroke-yellow-500";
      case 'failed':
        return "stroke-red-500";
      default:
        return "stroke-gray-300";
    }
  };
  
  // Function to render status icon for nodes
  const getNodeStatusIcon = (stepSlug: string, x: number, y: number) => {
    const step = stepStates.find(s => s.step_slug === stepSlug);
    if (!step) return null;
    
    // Default circle size and styles
    const circleRadius = 8;
    const circleCx = x;
    const circleCy = y;
    
    switch (step.status) {
      case 'completed':
        // Checkmark icon for completed
        return (
          <g className="status-icon">
            <circle cx={circleCx} cy={circleCy} r={circleRadius} fill="#22c55e" />
            <path 
              d={`M${circleCx-3} ${circleCy} L${circleCx-1} ${circleCy+2} L${circleCx+3} ${circleCy-2}`} 
              stroke="white" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              fill="none" 
            />
          </g>
        );
      case 'started':
        // Animated spinner for running
        return (
          <g className="status-icon">
            <circle cx={circleCx} cy={circleCy} r={circleRadius} fill="#eab308" />
            <path 
              d={`M${circleCx} ${circleCy-4} A4,4 0 1,1 ${circleCx-2.8},${circleCy-2.8}`} 
              stroke="white" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              fill="none"
              className="animate-spin"
              style={{ transformOrigin: `${circleCx}px ${circleCy}px` }}
            />
          </g>
        );
      case 'failed':
        // X icon for failed
        return (
          <g className="status-icon">
            <circle cx={circleCx} cy={circleCy} r={circleRadius} fill="#ef4444" />
            <path 
              d={`M${circleCx-3} ${circleCy-3} L${circleCx+3} ${circleCy+3} M${circleCx+3} ${circleCy-3} L${circleCx-3} ${circleCy+3}`} 
              stroke="white" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              fill="none" 
            />
          </g>
        );
      default:
        // Empty circle with a dot for waiting
        return (
          <g className="status-icon">
            <circle cx={circleCx} cy={circleCy} r={circleRadius} fill="#9ca3af" opacity="0.6" />
            <circle cx={circleCx} cy={circleCy} r="2" fill="white" />
          </g>
        );
    }
  };

  return (
    <div className={`workflow-dag ${className}`}>
      <svg 
        width="100%" 
        height="120" 
        viewBox="0 0 600 120" 
        xmlns="http://www.w3.org/2000/svg"
        style={{ maxWidth: '600px' }}
      >
        {/* Website node */}
        <g className={`node website ${websiteColors.animationClass}`}>
          <rect x="40" y="50" width="120" height="30" rx="6" className={`${websiteColors.fill} ${websiteColors.stroke}`} strokeWidth="2" />
          <text x="100" y="68" textAnchor="middle" className="text-xs font-medium">Website</text>
          {getNodeStatusIcon('website', 150, 65)}
        </g>

        {/* Sentiment node */}
        <g className={`node sentiment ${sentimentColors.animationClass}`}>
          <rect x="240" y="20" width="120" height="30" rx="6" className={`${sentimentColors.fill} ${sentimentColors.stroke}`} strokeWidth="2" />
          <text x="300" y="38" textAnchor="middle" className="text-xs font-medium">Sentiment</text>
          {getNodeStatusIcon('sentiment', 350, 35)}
        </g>

        {/* Tags node */}
        <g className={`node tags ${tagsColors.animationClass}`}>
          <rect x="240" y="50" width="120" height="30" rx="6" className={`${tagsColors.fill} ${tagsColors.stroke}`} strokeWidth="2" />
          <text x="300" y="68" textAnchor="middle" className="text-xs font-medium">Tags</text>
          {getNodeStatusIcon('tags', 350, 65)}
        </g>

        {/* Summary node */}
        <g className={`node summary ${summaryColors.animationClass}`}>
          <rect x="240" y="80" width="120" height="30" rx="6" className={`${summaryColors.fill} ${summaryColors.stroke}`} strokeWidth="2" />
          <text x="300" y="98" textAnchor="middle" className="text-xs font-medium">Summary</text>
          {getNodeStatusIcon('summary', 350, 95)}
        </g>

        {/* Save to DB node */}
        <g className={`node saveToDb ${saveToDbColors.animationClass}`}>
          <rect x="440" y="50" width="120" height="30" rx="6" className={`${saveToDbColors.fill} ${saveToDbColors.stroke}`} strokeWidth="2" />
          <text x="500" y="68" textAnchor="middle" className="text-xs font-medium">Save to DB</text>
          {getNodeStatusIcon('saveToDb', 550, 65)}
        </g>

        {/* Edges */}
        {/* Website -> Sentiment */}
        <path d="M160 55 Q200 55 220 35 Q240 15 270 25" fill="none" className={getEdgeColor('website')} strokeWidth="2" />
        {/* Website -> Tags */}
        <path d="M160 65 H240" fill="none" className={getEdgeColor('website')} strokeWidth="2" />
        {/* Website -> Summary */}
        <path d="M160 75 Q200 75 220 85 Q240 95 270 95" fill="none" className={getEdgeColor('website')} strokeWidth="2" />
        
        {/* Sentiment -> Save to DB */}
        <path d="M360 35 Q380 35 400 45 Q420 55 440 65" fill="none" className={getEdgeColor('sentiment')} strokeWidth="2" />
        {/* Tags -> Save to DB */}
        <path d="M360 65 H440" fill="none" className={getEdgeColor('tags')} strokeWidth="2" />
        {/* Summary -> Save to DB */}
        <path d="M360 95 Q380 95 400 85 Q420 75 440 65" fill="none" className={getEdgeColor('summary')} strokeWidth="2" />
        
        {/* Parallel Label */}
        <text x="300" y="110" textAnchor="middle" className="text-[10px] text-muted-foreground italic">Parallel Steps</text>
      </svg>
    </div>
  );
}