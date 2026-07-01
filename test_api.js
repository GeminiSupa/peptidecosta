import http from 'http';
const data = JSON.stringify({
  audience: "all_leads",
  channels: { email: true, whatsapp: false, emailSubject: "Nuevos Productos Disponibles" },
  message: "Test message"
});
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/broadcast',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, res => {
  res.on('data', d => process.stdout.write(d));
});
req.write(data);
req.end();
