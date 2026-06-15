const fetch = require('node-fetch');
async function run() {
  const url = 'http://localhost:3000/api/admin/commissions/weekly-report?period=custom&start=2026-06-08&end=2026-06-15&agentEmail=Camilledankers11%40gmail.com';
  console.log("Fetching", url);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': process.env.COOKIE || ''
      }
    });
    const data = await res.json();
    console.log("Status:", res.status);
    console.log(data);
  } catch(e) {
    console.error(e);
  }
}
run();
