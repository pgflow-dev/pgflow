'use client';

import { useEffect, useState } from 'react';
import { ResultRow } from '@/lib/db';
import { 
  ReactFlow, 
  Node, 
  Edge, 
  Background, 
  Controls, 
  Panel, 
  useNodesState, 
  useEdgesState, 
  ConnectionLineType 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface FlowDagClientProps {
  runData: ResultRow;
}

// Get status color for nodes
const getStatusColor = (status: string | undefined) => {
  switch (status) {
    case 'completed':
      return '#10b981'; // Green
    case 'started':
      return '#eab308'; // Yellow
    case 'failed':
      return '#ef4444'; // Red
    case 'created':
      return '#3b82f6'; // Blue
    default:
      return '#6b7280'; // Gray
  }
};

// Format timestamps
function formatTimeDifference(
  startDate: string | null,
  endDate: string | null,
): string {
  if (!startDate) return '';

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  const diffMs = end.getTime() - start.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 1) {
    return '< 1s';
  }

  if (diffSec < 60) {
    return `${diffSec}s`;
  }

  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Custom node component
const CustomNode = ({ data }: any) => {
  return (
    <div className="p-2 text-center">
      <div className="font-medium capitalize text-sm mb-2">{data.label}</div>
      <div className={`
        px-2 py-1 text-xs rounded-md mb-1.5
        ${data.status === 'completed'
          ? 'bg-green-500/20 text-green-300'
          : data.status === 'started'
            ? 'bg-yellow-500/20 text-yellow-300 animate-pulse'
            : data.status === 'failed'
              ? 'bg-red-500/20 text-red-300'
              : 'bg-blue-500/20 text-blue-300'
        }
      `}>
        <span className="capitalize">{data.status === 'created' ? 'Waiting' : data.status}</span>
      </div>
      {data.timing && (
        <div className="text-xs mt-1 opacity-80 px-2 py-1 bg-gray-800/50 rounded-md">
          {data.timing}
        </div>
      )}
    </div>
  );
};

export default function FlowDagClient({ runData }: FlowDagClientProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Create graph nodes and edges from runData
  useEffect(() => {
    if (!runData || !runData.step_states) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Create a flow definition graph
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Sort step_states by step.step_index
    const sortedStepStates = [...runData.step_states].sort((a, b) => {
      const aIndex = a.step?.step_index || 0;
      const bIndex = b.step?.step_index || 0;
      return aIndex - bIndex;
    });

    // Create nodes from step states
    sortedStepStates.forEach((stepState, index) => {
      const stepSlug = stepState.step_slug;
      const stepStatus = stepState.status;
      const statusColor = getStatusColor(stepStatus);

      // Find the corresponding step tasks for this step
      const stepTasks = runData.step_tasks
        ?.filter((task) => task.step_slug === stepState.step_slug)
        .sort((a, b) => (a.step_index || 0) - (b.step_index || 0));

      // Get timing information
      let timingInfo = '';
      if (stepStatus === 'started' && stepState.started_at) {
        timingInfo = 'Running...';
      } else if (stepStatus === 'completed' && stepState.started_at && stepState.completed_at) {
        timingInfo = formatTimeDifference(stepState.started_at, stepState.completed_at);
      } else if (stepStatus === 'failed' && stepState.started_at && stepState.failed_at) {
        timingInfo = `Failed after ${formatTimeDifference(stepState.started_at, stepState.failed_at)}`;
      }

      // Position nodes in a DAG layout
      let xPos = 0;
      let yPos = 0;

      // Special case for known step_slugs
      if (stepSlug === 'website') {
        xPos = 250;
        yPos = 100;
      } else if (['summary', 'sentiment', 'tags'].includes(stepSlug)) {
        // Parallel steps
        const parallelSteps = ['summary', 'sentiment', 'tags'];
        const position = parallelSteps.indexOf(stepSlug);
        xPos = 250 - 200 + position * 200;
        yPos = 250;
      } else if (stepSlug === 'saveToDb') {
        xPos = 250;
        yPos = 400;
      } else {
        // Default positioning for unknown steps
        xPos = 250 + (index % 3) * 300;
        yPos = 100 + Math.floor(index / 3) * 150;
      }

      // Create node
      flowNodes.push({
        id: stepSlug,
        data: {
          label: stepSlug.replace(/([A-Z])/g, ' $1').replace(/_/g, ' '),
          status: stepStatus,
          timing: timingInfo,
        },
        position: { x: xPos, y: yPos },
        style: {
          background: '#1e293b', // Dark background
          color: '#f8fafc',
          border: `2px solid ${statusColor}`,
          borderRadius: '8px',
          width: 200,
          boxShadow: stepStatus === 'started' 
            ? `0 0 15px ${statusColor}` 
            : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
      });
    });

    // Create edges based on flow definition dependencies
    // Extract dependencies from step properties
    sortedStepStates.forEach((stepState) => {
      if (stepState.step?.depends_on?.length) {
        stepState.step.depends_on.forEach((dependencyStepSlug) => {
          flowEdges.push({
            id: `${dependencyStepSlug}-${stepState.step_slug}`,
            source: dependencyStepSlug,
            target: stepState.step_slug,
            type: 'smoothstep',
            animated: stepState.status === 'started',
            style: {
              stroke: getStatusColor(stepState.status),
              strokeWidth: 2,
            },
          });
        });
      }
    });

    // Set the nodes and edges
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [runData, setNodes, setEdges]);

  // Define nodeTypes object
  const nodeTypes = { default: CustomNode };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      connectionLineType={ConnectionLineType.SmoothStep}
      proOptions={{ hideAttribution: true }}
      minZoom={0.5}
      maxZoom={1.5}
      defaultZoom={0.85}
      panOnScroll
      selectionOnDrag
      snapToGrid
    >
      <Controls position="bottom-right" showInteractive={false} />
      <Background color="#444444" gap={16} size={1} variant="dots" />
      <Panel position="top-left" className="p-2 bg-background/80 backdrop-blur-sm rounded-md shadow-md border text-xs">
        <div className="text-muted-foreground">
          Zoom: Scroll | Pan: Drag or Arrow keys
        </div>
      </Panel>
    </ReactFlow>
  );
}