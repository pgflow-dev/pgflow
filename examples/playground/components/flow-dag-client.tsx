'use client';

import { useEffect, useCallback } from 'react';
import { ResultRow } from '@/lib/db';
import { 
  ReactFlow, 
  Node, 
  Edge, 
  Background, 
  Controls,
  useNodesState, 
  useEdgesState,
  ConnectionLineType,
  ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

interface FlowDagClientProps {
  runData: ResultRow;
}

// Dagre layout helper function
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  // Create new graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Set graph direction and node separation
  dagreGraph.setGraph({ 
    rankdir: direction, 
    nodesep: 80, 
    ranksep: 80, 
    marginx: 20, 
    marginy: 20 
  });

  // Add nodes to graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { 
      width: node.style?.width as number || 160, 
      height: 40 
    });
  });

  // Add edges to graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply layout to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    // Position node at calculated position
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (node.style?.width as number || 160) / 2,
        y: nodeWithPosition.y - 20,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

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

function FlowComponent({ runData }: FlowDagClientProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Create graph nodes and edges from runData with auto-layout
  useEffect(() => {
    if (!runData || !runData.step_states) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Create a flow definition graph
    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    // Sort step_states by step.step_index
    const sortedStepStates = [...runData.step_states].sort((a, b) => {
      const aIndex = a.step?.step_index || 0;
      const bIndex = b.step?.step_index || 0;
      return aIndex - bIndex;
    });

    // Create nodes from step states
    sortedStepStates.forEach((stepState) => {
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

      // Create node - position will be set by auto-layout
      initialNodes.push({
        id: stepSlug,
        data: {
          label: stepSlug.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase(),
          status: isRetrying ? 'retrying' : stepStatus,
        },
        // Initial position - will be replaced by auto-layout
        position: { x: 0, y: 0 },
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
          
          initialEdges.push({
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

    // Apply auto-layout using dagre
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      initialNodes,
      initialEdges,
      'LR' // Left to right layout for side panel
    );

    // Set the nodes and edges
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    
    
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

// Export the component wrapped in ReactFlowProvider
export default function FlowDagClient({ runData }: FlowDagClientProps) {
  return (
    <ReactFlowProvider>
      <FlowComponent runData={runData} />
    </ReactFlowProvider>
  );
}