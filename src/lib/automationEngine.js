/**
 * Automation Execution Engine
 * Reads a JSON representation of a workflow (nodes and edges)
 * and executes the logic sequentially.
 */

export async function executeWorkflow(workflowData, triggerPayload = {}) {
  const { nodes, edges } = workflowData;
  if (!nodes || !edges) return;

  // 1. Find the trigger node
  const triggerNode = nodes.find(n => n.type === 'triggerNode');
  if (!triggerNode) {
    console.error('Workflow has no trigger node');
    return;
  }

  // 2. Determine execution order by traversing edges
  let currentNodeId = triggerNode.id;
  const executionPath = [];

  while (currentNodeId) {
    const nextEdge = edges.find(e => e.source === currentNodeId);
    if (!nextEdge) break;

    const nextNode = nodes.find(n => n.id === nextEdge.target);
    if (nextNode) {
      executionPath.push(nextNode);
      currentNodeId = nextNode.id;
    } else {
      break;
    }
  }

  // 3. Execute actions in order
  for (const node of executionPath) {
    if (node.type === 'actionNode') {
      try {
        await executeAction(node.data, triggerPayload);
      } catch (err) {
        console.error(`Failed to execute action ${node.id}`, err);
        // Depending on requirements, we might want to stop execution on error:
        break;
      }
    }
  }
}

async function executeAction(actionData, context) {
  const { actionType } = actionData;

  switch (actionType) {
    case 'whatsapp':
      console.log(`[Engine] Sending WhatsApp to ${actionData.phone}: ${actionData.message}`);
      // Here you would integrate with your Baileys WhatsApp client logic
      break;
      
    case 'email':
      console.log(`[Engine] Sending Email...`);
      // Integration with Nodemailer
      break;

    case 'db_update':
      console.log(`[Engine] Updating Database...`);
      // Integration with Supabase client
      break;

    default:
      console.warn(`[Engine] Unknown action type: ${actionType}`);
  }
}
