'use client';
import { Settings, Zap } from 'lucide-react';

export default function Sidebar() {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 border-r bg-gray-50 p-4 h-full flex flex-col gap-4">
      <div className="font-bold text-lg border-b pb-2">Nodes</div>
      
      <div className="text-sm font-semibold text-gray-500 uppercase">Triggers</div>
      <div 
        className="flex items-center gap-2 p-2 border border-green-500 bg-white rounded cursor-grab hover:shadow-md transition"
        onDragStart={(event) => onDragStart(event, 'triggerNode')}
        draggable
      >
        <Zap size={16} className="text-green-500" />
        <span className="text-sm font-medium">Trigger</span>
      </div>

      <div className="text-sm font-semibold text-gray-500 uppercase mt-4">Actions</div>
      <div 
        className="flex items-center gap-2 p-2 border border-blue-500 bg-white rounded cursor-grab hover:shadow-md transition"
        onDragStart={(event) => onDragStart(event, 'actionNode')}
        draggable
      >
        <Settings size={16} className="text-blue-500" />
        <span className="text-sm font-medium">Action</span>
      </div>

      <div className="mt-auto text-xs text-gray-400">
        Drag a node onto the canvas to add it to your workflow.
      </div>
    </aside>
  );
}
