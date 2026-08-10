'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import Sidebar from './Sidebar';
import { TriggerNode, ActionNode } from './CustomNodes';

const initialNodes = [
  {
    id: '1',
    type: 'triggerNode',
    data: { label: 'Trigger Event', eventType: 'webhook' },
    position: { x: 250, y: 50 },
  },
];

const nodeTypes = {
  triggerNode: TriggerNode,
  actionNode: ActionNode,
};

let id = 1;
const getId = () => `dndnode_${id++}`;

export default function AutomationBuilder() {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [workflowId, setWorkflowId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to update node data (used for both new and loaded nodes)
  const updateNodeData = useCallback((nodeId, key, value) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, [key]: value } };
        }
        return n;
      })
    );
  }, [setNodes]);

  // Load existing workflow
  useEffect(() => {
    async function loadWorkflow() {
      try {
        const res = await fetch('/api/admin/visual-automations');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        
        if (data.workflow && data.workflow.workflow_data) {
          setWorkflowId(data.workflow.id);
          const wfData = data.workflow.workflow_data;
          
          if (wfData.nodes && wfData.nodes.length > 0) {
            // Re-attach onChange handlers to loaded nodes
            const loadedNodes = wfData.nodes.map(node => ({
              ...node,
              data: {
                ...node.data,
                onChange: (key, value) => updateNodeData(node.id, key, value)
              }
            }));
            
            setNodes(loadedNodes);
            setEdges(wfData.edges || []);
            // Update the ID counter so new nodes don't collide
            id = Math.max(...loadedNodes.map(n => parseInt(n.id.replace('dndnode_', '')) || 0)) + 1;
          }
        }
      } catch (err) {
        console.error('Error loading workflow:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadWorkflow();
  }, [setNodes, setEdges, updateNodeData]); // Only run on mount
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (typeof type === 'undefined' || !type) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = getId();
      const newNode = {
        id: newNodeId,
        type,
        position,
        data: { 
          label: type === 'triggerNode' ? 'Trigger Event' : 'New Action',
          onChange: (key, value) => updateNodeData(newNodeId, key, value)
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, updateNodeData]
  );

  const onSave = useCallback(async () => {
    if (reactFlowInstance) {
      setIsSaving(true);
      try {
        const flow = reactFlowInstance.toObject();
        
        // Strip onChange functions from payload before saving to DB
        const cleanFlow = {
          ...flow,
          nodes: flow.nodes.map(n => {
            const { onChange, ...cleanData } = n.data;
            return { ...n, data: cleanData };
          })
        };

        const res = await fetch('/api/admin/visual-automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: workflowId,
            name: 'Main Automation Workflow',
            workflowData: cleanFlow
          })
        });

        if (!res.ok) throw new Error('Failed to save');
        const data = await res.json();
        
        if (data.workflow) {
          setWorkflowId(data.workflow.id);
          alert('Workflow saved successfully!');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to save workflow.');
      } finally {
        setIsSaving(false);
      }
    }
  }, [reactFlowInstance, workflowId]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading Engine...</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <h1 className="font-bold text-xl">Automation Builder</h1>
        <button 
          onClick={onSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save Workflow'}
        </button>
      </div>
      
      <div className="flex flex-1 overflow-hidden" ref={reactFlowWrapper}>
        <Sidebar />
        <div className="flex-1 h-full">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background color="#ccc" gap={16} />
              <Controls />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  );
}
