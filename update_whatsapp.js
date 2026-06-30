const fs = require('fs');
const path = 'src/app/api/orders/create/route.js';
let content = fs.readFileSync(path, 'utf8');

// Update the customer confirmation template
content = content.replace(
  "name: 'confirmacion_pedido_cliente_v2',",
  "name: process.env.WHATSAPP_CUSTOMER_ORDER_TEMPLATE || 'confirmacion_pedido_cliente_v2',"
);

fs.writeFileSync(path, content, 'utf8');
