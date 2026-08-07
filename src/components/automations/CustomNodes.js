'use client';
import { Handle, Position } from '@xyflow/react';
import { Settings, Zap } from 'lucide-react';

export function TriggerNode({ data, isConnectable }) {
  return (
    <div className="bg-white border-2 border-green-500 rounded-lg shadow-sm min-w-[250px]">
      <div className="bg-green-500 text-white px-3 py-2 rounded-t-sm flex items-center gap-2 font-semibold">
        <Zap size={16} />
        {data.label || 'Trigger'}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <label className="text-xs font-semibold text-gray-600 uppercase">Event Type</label>
        <select 
          className="border rounded p-1 text-sm bg-gray-50" 
          value={data.eventType || 'webhook'}
          onChange={(e) => data.onChange && data.onChange('eventType', e.target.value)}
        >
          <option value="webhook">Webhook Received</option>
          <option value="cron">Schedule (Cron)</option>
          <option value="db_insert">New Order</option>
        </select>
        {data.eventType === 'cron' && (
          <input 
            type="text" 
            placeholder="0 * * * *"
            className="border rounded p-1 text-sm mt-1" 
            value={data.cronExp || ''}
            onChange={(e) => data.onChange && data.onChange('cronExp', e.target.value)}
          />
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-green-500"
      />
    </div>
  );
}

export function ActionNode({ data, isConnectable }) {
  return (
    <div className="bg-white border-2 border-blue-500 rounded-lg shadow-sm min-w-[250px]">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
      <div className="bg-blue-500 text-white px-3 py-2 rounded-t-sm flex items-center gap-2 font-semibold">
        <Settings size={16} />
        {data.label || 'Action'}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <label className="text-xs font-semibold text-gray-600 uppercase">Action Type</label>
        <select 
          className="border rounded p-1 text-sm bg-gray-50"
          value={data.actionType || 'whatsapp'}
          onChange={(e) => data.onChange && data.onChange('actionType', e.target.value)}
        >
          <option value="whatsapp">Send WhatsApp</option>
          <option value="email">Send Email</option>
          <option value="db_update">Update Database</option>
        </select>

        {data.actionType === 'whatsapp' && (
          <>
            <input 
              type="text" 
              placeholder="Phone Number (e.g. +123...)"
              className="border rounded p-1 text-sm mt-1" 
              value={data.phone || ''}
              onChange={(e) => data.onChange && data.onChange('phone', e.target.value)}
            />
            <textarea 
              placeholder="Message..."
              className="border rounded p-1 text-sm mt-1 resize-none h-16" 
              value={data.message || ''}
              onChange={(e) => data.onChange && data.onChange('message', e.target.value)}
            />
          </>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
    </div>
  );
}
