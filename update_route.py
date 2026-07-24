import re
import sys

def main():
    path = "/Users/apple/Desktop/costapeptides/src/app/api/order-notification/route.js"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update Customer Email HTML Builder
    # Replace from "const buildCustomerHtml = (" up to the closing "};" before "export async function POST"
    customer_html_pattern = re.compile(
        r"(const buildCustomerHtml = \([^)]+\) => \{)(.*?)(^\s*};\s*^export async function POST)",
        re.DOTALL | re.MULTILINE
    )
    
    new_customer_html = """
  const isEn = lang === 'en';
  
  const isPaid = order.status && (order.status.toLowerCase().includes('paid') || order.status.toLowerCase().includes('complet'));
  
  const strings = {
    title: isPaid ? (isEn ? 'Order Confirmed!' : '¡Pedido Confirmado!') : (isEn ? 'Action Required: Complete Payment' : 'Acción Requerida: Completar Pago'),
    subtitle: isPaid 
      ? (isEn ? "We've received your order and payment. Here are your transaction details." : 'Hemos recibido su pedido y su pago. A continuación encontrará los detalles.') 
      : (isEn ? "We've received your order! Please submit your payment to complete processing." : '¡Hemos recibido su pedido! Por favor envíe su pago para procesarlo.'),
    ref: isEn ? 'Order Reference' : 'Referencia del Pedido',
    method: isEn ? 'Payment Method' : 'Método de Pago',
    status: isEn ? 'Payment Status' : 'Estado del Pago',
    paidStatus: isEn ? 'Paid / Completed' : 'Pagado / Completado',
    pendingStatus: isEn ? 'Pending Payment' : 'Pago Pendiente',
    shippingTo: isEn ? 'Shipping Destination' : 'Destinatario de Envío',
    orderSummary: isEn ? 'Order Summary' : 'Resumen de su Orden',
    product: isEn ? 'Product' : 'Producto',
    qty: isEn ? 'Qty' : 'Cant',
    totalPrice: isEn ? 'Total Price' : 'Precio Total',
    supportTitle: isEn ? 'Need Assistance?' : '¿Necesita Ayuda?',
    supportText: isEn ? 'Our scientific support desk is ready to answer any questions about reconstitution, supplies, or shipping details.' : 'Nuestra mesa de soporte científico está lista para responder cualquier consulta sobre reconstitución, suministros o logística de envío.',
    whatsappBtn: isEn ? 'Chat with Support on WhatsApp' : 'Chatear con Soporte por WhatsApp',
    payNowBtn: isEn ? 'Pay Now via WhatsApp' : 'Pagar Ahora vía WhatsApp',
    footer: isEn ? 'High-Purity Research Peptides · Base in Costa Rica' : 'Péptidos de Alta Pureza para Investigación · Con base en Costa Rica',
  };

  const whatsappPayLink = \`https://api.whatsapp.com/send?phone=\${links.whatsappNumber}&text=\${encodeURIComponent(
    isEn 
      ? \`Hi, I need to complete payment for Order \${order.orderNumber}. My selected method was \${paymentLabel}.\`
      : \`Hola, necesito completar el pago de mi Pedido \${order.orderNumber}. Mi método seleccionado fue \${paymentLabel}.\`
  )}\`;

  return \`
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;width:100%;max-width:700px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);box-sizing:border-box;">
      
      <!-- Premium Science Theme Header Banner -->
      <div style="background:linear-gradient(135deg, #0f172a, #022c22);padding:40px 32px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" style="max-height:56px;border-radius:8px;margin-bottom:20px;background:rgba(255,255,255,0.08);padding:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 10px;letter-spacing:-0.5px;">\${strings.title}</h1>
        <p style="color:#e2e8f0;font-size:15px;margin:0;max-width:500px;margin:0 auto;line-height:1.5;">\${strings.subtitle}</p>
      </div>

      <div style="padding:32px;">
        
        \${!isPaid ? \`
        <div style="text-align:center;margin-bottom:32px;">
          <a href="\${whatsappPayLink}" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:12px;font-weight:800;font-size:18px;box-shadow:0 4px 12px rgba(37,211,102,0.3);transition:transform 0.2s;text-transform:uppercase;letter-spacing:0.5px;">
            💰 \${strings.payNowBtn}
          </a>
        </div>
        \` : ''}

        <!-- Summary Dashboard Grid -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:32px 24px;margin-bottom:32px;text-align:center;box-shadow:inset 0 2px 4px 0 rgba(0,0,0,0.02);">
          
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">\${strings.ref}</div>
            <div style="font-family:monospace;font-weight:bold;color:#059669;font-size:20px;margin-top:4px;">\${escapeHtml(order.orderNumber || 'N/A')}</div>
          </div>
          
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">\${strings.method}</div>
            <div style="font-weight:bold;color:#0f172a;font-size:18px;margin-top:4px;">\${escapeHtml(paymentLabel)}</div>
          </div>
          
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">\${strings.status}</div>
            <div>
              <span style="background-color:\${isPaid ? '#dcfce7' : '#fef08a'};color:\${isPaid ? '#15803d' : '#854d0e'};font-weight:800;font-size:13px;padding:6px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;border:1px solid \${isPaid ? '#bbf7d0' : '#fde047'};">
                \${isPaid ? strings.paidStatus : strings.pendingStatus}
              </span>
            </div>
          </div>

          <div style="border-top:2px solid #e2e8f0;margin:24px auto 0;padding-top:24px;max-width:350px;">
            \${order.subtotal ? \`
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14.5px;">
              <span style="color:#64748b;font-weight:600;">Subtotal</span>
              <span style="font-weight:700;color:#0f172a;">\${formatMoney(order.subtotal, order.currency)}</span>
            </div>
            \` : ''}
            \${order.volumeDiscount ? \`
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14.5px;">
              <span style="color:#15803d;font-weight:600;">\${isEn ? 'Volume Discount' : 'Descuento por Volumen'}</span>
              <span style="font-weight:700;color:#15803d;">-\${formatMoney(order.volumeDiscount, order.currency)}</span>
            </div>
            \` : ''}
            \${order.promoDiscount ? \`
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14.5px;">
              <span style="color:#0284c7;font-weight:600;">\${isEn ? 'Promo Discount' : 'Descuento Promocional'}</span>
              <span style="font-weight:700;color:#0284c7;">-\${formatMoney(order.promoDiscount, order.currency)}</span>
            </div>
            \` : ''}
            \${order.shipping !== undefined ? \`
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14.5px;">
              <span style="color:#64748b;font-weight:600;">\${isEn ? 'Shipping' : 'Envío'}</span>
              <span style="font-weight:700;color:#0f172a;">\${order.shipping === 0 ? (isEn ? 'FREE' : 'GRATIS') : formatMoney(order.shipping, order.currency)}</span>
            </div>
            \` : ''}
            
            <div style="margin-top:16px;padding-top:16px;border-top:1px dashed #cbd5e1;text-align:center;">
              <div style="font-size:14px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">\${strings.totalPrice}</div>
              <div style="font-size:26px;font-weight:900;color:#059669;">
                \${totalPrimary}
              </div>
              \${totalUsd && totalUsd !== totalPrimary ? \`<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">\${totalUsd}</div>\` : ''}
              \${totalCrc && totalCrc !== totalPrimary ? \`<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">\${totalCrc}</div>\` : ''}
            </div>
          </div>
        </div>

        <!-- Shipping Section -->
        <h3 style="font-size:15px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;text-align:center;">📦 \${strings.shippingTo}</h3>
        <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14.5px;color:#475569;margin:0 auto 32px;line-height:1.6;box-shadow:0 1px 2px 0 rgba(0,0,0,0.05);text-align:center;max-width:500px;">\${escapeHtml(order.shippingAddress || 'N/A')}</pre>

        <!-- Cart Table -->
        <h3 style="font-size:15px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 12px;text-align:center;">📋 \${strings.orderSummary}</h3>
        <div style="max-width:500px;margin:0 auto 32px;">
          <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px 0 rgba(0,0,0,0.05);">
            <thead style="background:#f8fafc;">
              <tr>
                <th style="text-align:left;padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;border-bottom:2px solid #e2e8f0;letter-spacing:0.5px;">\${strings.product}</th>
                <th style="text-align:center;padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;border-bottom:2px solid #e2e8f0;width:60px;letter-spacing:0.5px;">\${strings.qty}</th>
                <th style="text-align:right;padding:12px 16px;font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;border-bottom:2px solid #e2e8f0;width:90px;letter-spacing:0.5px;">Total</th>
              </tr>
            </thead>
            <tbody style="padding:0 16px;">
              \${buildItemsRows(order.items, order.currency)}
            </tbody>
          </table>
        </div>

        \${!isPaid ? \`
        <div style="text-align:center;margin-bottom:32px;border-top:1px solid #e2e8f0;padding-top:32px;">
          <h4 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:800;">\${isEn ? 'Ready to complete your order?' : '¿Listo para completar su pedido?'}</h4>
          <a href="\${whatsappPayLink}" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:800;font-size:16px;box-shadow:0 4px 6px rgba(37,211,102,0.25);transition:transform 0.2s;">
            💰 \${strings.payNowBtn}
          </a>
        </div>
        \` : ''}

        \${(promoCodesList && promoCodesList.length > 0) || (isEn ? salesTextEn : salesTextEs) ? \`
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:20px;margin:0 auto 32px;box-shadow:0 1px 2px 0 rgba(0,0,0,0.05);max-width:500px;text-align:center;">
          <h4 style="margin:0 0 10px;color:#b45309;font-size:15px;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">🎁 \${isEn ? 'Current Sales & Promo Codes' : 'Ventas Actuales y Códigos Promocionales'}</h4>
          \${(isEn ? salesTextEn : salesTextEs) ? \`<p style="margin:0 0 10px;color:#92400e;font-size:14px;line-height:1.5;font-weight:500;">\${escapeHtml(isEn ? salesTextEn : salesTextEs)}</p>\` : ''}
          \${promoCodesList && promoCodesList.length > 0 ? \`<p style="margin:0;color:#92400e;font-size:14px;line-height:1.5;"><strong>\${isEn ? 'Active Codes:' : 'Códigos Activos:'}</strong> <br/> \${promoCodesList.map(p => \`<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;border:1px solid #fde68a;"><strong>\${p.code}</strong> (\${p.discount_pct * 100}% off)</span>\`).join(' ')}</p>\` : ''}
        </div>
        \` : ''}

        <!-- Science High Purity Support CTA Block -->
        <div style="background:linear-gradient(135deg, rgba(5,150,105,0.06), rgba(16,185,129,0.02));border:1px dashed rgba(5,150,105,0.3);border-radius:16px;padding:24px;text-align:center;max-width:500px;margin:0 auto;">
          <h4 style="margin:0 0 8px;color:#047857;font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">🔬 \${strings.supportTitle}</h4>
          <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5;font-weight:500;">\${strings.supportText}</p>
          <p style="margin:0 0 20px;color:#0f172a;font-size:14.5px;line-height:1.6;font-weight:600;">
            <strong>Costa Rica:</strong> +506 8404-6973<br/>
            <strong>USA / Int'l:</strong> +1 (831) 471-5559
          </p>
          <a href="https://api.whatsapp.com/send?phone=\${links.whatsappNumber}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.1);transition:transform 0.2s;">
            💬 \${strings.whatsappBtn}
          </a>
        </div>

      </div>

      <div style="background:#f1f5f9;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
        \${strings.footer}
      </div>

    </div>
  \`;
"""

    content = customer_html_pattern.sub(r"\1\n" + new_customer_html + r"\3", content)

    # 2. Update Admin Email HTML Builder
    admin_html_pattern = re.compile(
        r"(const buildAdminHtml = \([^)]+\) => \{)(.*?)(^\s*};\s*^// Customer HTML)",
        re.DOTALL | re.MULTILINE
    )
    
    new_admin_html = """
  const shippingAmount = order.shipping !== undefined ? Number(order.shipping || 0) : undefined;
  const itemsAfterDiscounts = shippingAmount !== undefined
    ? Number(order.total || 0) - shippingAmount
    : Number(order.total || 0);
  const shippingLabel = shippingAmount === undefined
    ? 'N/A'
    : shippingAmount === 0
      ? 'FREE'
      : formatMoney(shippingAmount, order.currency);
      
  const isPaid = order.status && (order.status.toLowerCase().includes('paid') || order.status.toLowerCase().includes('complet'));

  return \`
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6;width:100%;max-width:700px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);box-sizing:border-box;">
      
      <!-- Premium Admin Header Banner -->
      <div style="background:linear-gradient(135deg, #0f172a, #4338ca);padding:40px 32px;text-align:center;">
        <img src="https://catalog.peptidescostarica.net/logo.png" alt="Peptides Costa Rica" style="max-height:56px;border-radius:8px;margin-bottom:20px;background:rgba(255,255,255,0.08);padding:6px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
        <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 10px;letter-spacing:-0.5px;">New Order Received!</h1>
        <p style="color:#e0e7ff;font-size:15px;margin:0;max-width:500px;margin:0 auto;line-height:1.5;">A new order has been placed on the Peptides Costa Rica catalog.</p>
      </div>

      <div style="padding:32px;background-color:#f8fafc;">
        
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px 24px;margin-bottom:24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);text-align:center;">
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Order Reference</div>
            <div style="font-family:monospace;font-weight:bold;color:#4338ca;font-size:20px;margin-top:4px;">\${escapeHtml(order.orderNumber || 'N/A')}</div>
          </div>
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Payment Method</div>
            <div style="font-weight:bold;color:#0f172a;font-size:18px;margin-top:4px;">\${escapeHtml(paymentLabel)}</div>
          </div>
          <div style="margin-bottom:24px;">
            <div style="color:#64748b;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Order Status</div>
            <div>
              <span style="background-color:\${isPaid ? '#dcfce7' : '#fef08a'};color:\${isPaid ? '#15803d' : '#854d0e'};padding:6px 14px;border-radius:20px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;border:1px solid \${isPaid ? '#bbf7d0' : '#fde047'};">\${escapeHtml(order.status || 'Pending')}</span>
            </div>
          </div>
          
          <div style="border-top:2px solid #e2e8f0;margin:24px auto 0;padding-top:24px;max-width:350px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14.5px;">
              <span style="color:#64748b;font-weight:600;">Items Amount</span>
              <span style="font-weight:700;color:#0f172a;">\${formatMoney(itemsAfterDiscounts, order.currency)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14.5px;">
              <span style="color:#64748b;font-weight:600;">Shipping Fee</span>
              <span style="font-weight:700;color:\${shippingAmount === 0 ? '#15803d' : '#0f172a'};">\${shippingLabel}</span>
            </div>
            
            <div style="margin-top:16px;padding-top:16px;border-top:1px dashed #cbd5e1;text-align:center;">
              <div style="font-size:14px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Grand Total</div>
              <div style="font-size:26px;font-weight:900;color:#0f172a;">\${totalPrimary}</div>
              \${totalUsd && totalUsd !== totalPrimary ? \`<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">\${totalUsd}</div>\` : ''}
              \${totalCrc && totalCrc !== totalPrimary ? \`<div style="font-size:14px;color:#64748b;font-weight:700;margin-top:4px;">\${totalCrc}</div>\` : ''}
            </div>
          </div>
        </div>

        <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;text-align:center;">Customer Profile</h2>
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:0 auto 24px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);max-width:500px;text-align:center;">
          <div style="margin-bottom:12px;"><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">Name</span> <span style="font-weight:600;font-size:16px;color:#0f172a;">\${escapeHtml(order.customerName)}</span></div>
          \${order.customerIdNumber ? \`
            <div style="margin-bottom:12px;"><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">ID Number</span> <span style="font-weight:600;font-size:15px;color:#0f172a;">\${escapeHtml(order.customerIdNumber)} (\${escapeHtml(
              order.customerIdType === '1' ? 'National ID' :
              order.customerIdType === '6' ? 'DIMEX' :
              order.customerIdType === '5' ? 'Passport' :
              order.customerIdType === '2' ? 'Corporate ID' :
              order.customerIdType || 'N/A'
            )})</span></div>
          \` : ''}
          <div style="margin-bottom:12px;"><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">WhatsApp</span> <a href="https://wa.me/\${(order.customerPhone || '').replace(/[^0-9]/g, '')}" style="color:#25D366;text-decoration:none;font-weight:800;font-size:16px;">\${escapeHtml(order.customerPhone || 'N/A')}</a></div>
          <div><span style="color:#64748b;font-size:13px;text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;">Email</span> <span style="font-weight:600;font-size:15px;color:#0f172a;">\${escapeHtml(order.customerEmail || 'N/A')}</span></div>
        </div>

        <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;text-align:center;">Shipping Coordinates</h2>
        <pre style="white-space:pre-wrap;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14.5px;color:#334155;margin:0 auto 24px;line-height:1.6;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);max-width:500px;text-align:center;">\${escapeHtml(order.shippingAddress || 'N/A')}</pre>

        <h2 style="font-size:14px;font-weight:800;color:#0f172a;margin:0 0 12px;text-transform:uppercase;letter-spacing:1px;text-align:center;">Purchased Items</h2>
        <div style="max-width:500px;margin:0 auto 20px;">
          <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);">
            <thead>
              <tr style="background-color:#f8fafc;">
                <th style="text-align:left;padding:12px 16px;border-bottom:2px solid #e2e8f0;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;letter-spacing:0.5px;">Product</th>
                <th style="text-align:center;padding:12px 16px;border-bottom:2px solid #e2e8f0;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;width:70px;letter-spacing:0.5px;">Qty</th>
                <th style="text-align:right;padding:12px 16px;border-bottom:2px solid #e2e8f0;font-size:12px;text-transform:uppercase;color:#64748b;font-weight:700;width:100px;letter-spacing:0.5px;">Total</th>
              </tr>
            </thead>
            <tbody style="padding:0 16px;">
              \${buildItemsRows(order.items, order.currency)}
              \${order.subtotal ? \`
              <tr style="border-top:2px solid #e2e8f0;">
                <td colspan="2" style="text-align:right;padding:12px 16px;font-size:14px;color:#475569;font-weight:600;">Subtotal</td>
                <td style="text-align:right;padding:12px 16px;font-size:14px;color:#0f172a;font-weight:700;">\${formatMoney(order.subtotal, order.currency)}</td>
              </tr>\` : ''}
              \${order.volumeDiscount ? \`
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#15803d;font-weight:600;">Volume Discount</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#15803d;font-weight:700;">-\${formatMoney(order.volumeDiscount, order.currency)}</td>
              </tr>\` : ''}
              \${order.promoDiscount ? \`
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#0284c7;font-weight:600;">Promo Discount</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#0284c7;font-weight:700;">-\${formatMoney(order.promoDiscount, order.currency)}</td>
              </tr>\` : ''}
              \${order.shipping !== undefined ? \`
              <tr>
                <td colspan="2" style="text-align:right;padding:8px 16px;font-size:14px;color:#475569;font-weight:600;">Shipping</td>
                <td style="text-align:right;padding:8px 16px;font-size:14px;color:#0f172a;font-weight:700;">\${order.shipping === 0 ? 'FREE' : formatMoney(order.shipping, order.currency)}</td>
              </tr>\` : ''}
            </tbody>
          </table>
        </div>

        <div style="text-align:center;padding-top:20px;color:#94a3b8;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
          Peptides Costa Rica Admin Notification System
        </div>
      </div>
    </div>
  \`;
"""
    content = admin_html_pattern.sub(r"\1\n" + new_admin_html + r"\3", content)
    
    # 3. Update Email Sending logic to send immediately
    # Replace: const skipCustomer = order.adminNotificationOnly === true || (!isPaid && !order.forceCustomerReceipt);
    # With:    const skipCustomer = order.adminNotificationOnly === true;
    content = content.replace("const skipCustomer = order.adminNotificationOnly === true || (!isPaid && !order.forceCustomerReceipt);", "const skipCustomer = order.adminNotificationOnly === true;")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    main()
