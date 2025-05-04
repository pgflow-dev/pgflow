'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

type CustomNodeData = {
  label: string;
  status: string;
  timing: string;
};

function CustomNode({ data }: NodeProps<CustomNodeData>) {
  return (
    <div className="p-2 text-center">
      <Handle type="target" position={Position.Top} className="w-2 h-2" />
      
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
      
      <Handle type="source" position={Position.Bottom} className="w-2 h-2" />
    </div>
  );
}

export default memo(CustomNode);