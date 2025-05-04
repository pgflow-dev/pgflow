'use client';

import { useEffect } from 'react';
import { ResultRow } from '@/lib/db';
import { 
  ReactFlow, 
  Node, 
  Edge, 
  Background, 
  Controls,
  useNodesState, 
  useEdgesState, 
  ConnectionLineType 
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface FlowDagClientProps {
  runData: ResultRow;
}

// Get status color for nodes - matching the existing UI
const getStatusColor = (status: string | undefined, isRetrying: boolean = false) => {
  if (isRetrying) return '#ef4444'; // Red with pulse for retrying
  
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

// Custom node component - simplified to match design request
const CustomNode = ({ data }: any) => {
  return (
    <div className="px-3 py-2 text-xs font-medium flex items-center justify-between">
      <span className="capitalize">
        {data.label}
      </span>
      <div 
        className={`h-3 w-3 rounded-full ml-2 ${
          data.status === 'completed'
            ? 'bg-green-500'
            : data.status === 'started'
              ? 'bg-yellow-500 animate-pulse'
              : data.status === 'failed'
                ? 'bg-red-500'
                : data.status === 'created'
                  ? 'bg-blue-500'
                  : 'bg-gray-500'
        }`}
      />
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
      
      // Find the step tasks for this step
      const stepTasks = runData.step_tasks
        ?.filter((task) => task.step_slug === stepState.step_slug)
        .sort((a, b) => (a.step_index || 0) - (b.step_index || 0));
      
      // Get the latest task to check for retries
      const latestTask = stepTasks && stepTasks.length > 0
        ? stepTasks.sort((a, b) => (b.attempts_count || 0) - (a.attempts_count || 0))[0]
        : null;
      
      // Check if retrying
      const isRetrying = latestTask && latestTask.attempts_count > 1 && stepState.status === 'started';
      const statusColor = getStatusColor(stepStatus, isRetrying);

      // Position nodes in a vertical column for side layout
      const xPos = 80;
      let yPos = 0;
      
      // Position based on step index or known steps
      if (stepSlug === 'website') {
        yPos = 50;
      } else if (['summary', 'sentiment', 'tags'].includes(stepSlug)) {
        // Parallel steps at same vertical level
        const parallelSteps = ['summary', 'sentiment', 'tags'];
        yPos = 150;
        // Offset parallel nodes horizontally
        const position = parallelSteps.indexOf(stepSlug);
        if (position !== -1) {
          // Offset horizontally - first one centered, others to the sides
          if (position === 0) xPos = xPos - 100;
          else if (position === 2) xPos = xPos + 100;
        }
      } else if (stepSlug === 'saveToDb') {
        yPos = 250;
      } else {
        // Default positioning for unknown steps
        yPos = 50 + index * 80;
      }

      // Create node - simplified styling with matching colors from UI
      flowNodes.push({
        id: stepSlug,
        data: {
          label: stepSlug.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase(),
          status: isRetrying ? 'retrying' : stepStatus,
        },
        position: { x: xPos, y: yPos },
        style: {
          background: '#1e293b', // Dark background
          color: '#f8fafc',
          border: `2px solid ${statusColor}`,
          borderRadius: '4px',
          width: 160,
          fontSize: '12px',
          boxShadow: stepStatus === 'started' 
            ? `0 0 8px ${statusColor}` 
            : '0 2px 4px rgba(0, 0, 0, 0.1)',
        },
      });
    });

    // Create edges based on flow definition dependencies
    sortedStepStates.forEach((stepState) => {
      if (stepState.step?.depends_on?.length) {
        stepState.step.depends_on.forEach((dependencyStepSlug) => {
          const isRunning = stepState.status === 'started';
          const statusColor = getStatusColor(stepState.status);
          
          flowEdges.push({
            id: `${dependencyStepSlug}-${stepState.step_slug}`,
            source: dependencyStepSlug,
            target: stepState.step_slug,
            type: 'smoothstep',
            animated: isRunning,
            style: {
              stroke: statusColor,
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

  // Define nodeTypes object with our custom node
  const nodeTypes = { default: CustomNode };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      connectionLineType={ConnectionLineType.SmoothStep}
      proOptions={{ hideAttribution: true }}
      minZoom={0.5}
      maxZoom={1.5}
      defaultZoom={0.9}
    >
      <Controls position="bottom-right" showInteractive={false} />
      <Background color="#333" gap={16} size={1} variant="dots" />
    </ReactFlow>
  );
}