async function run() {
  const messengerPayload = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        time: Date.now(),
        messaging: [
          {
            sender: { id: 'TEST_SENDER_123' },
            recipient: { id: 'PAGE_ID' },
            timestamp: Date.now(),
            message: {
              mid: 'mid.1457764197618:41d102a3e1ae206a38',
              text: 'Hello, testing!'
            }
          }
        ]
      }
    ]
  };

  try {
    const res = await fetch('http://localhost:3000/api/facebook/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messengerPayload)
    });
    console.log(await res.json());
  } catch (e) {
    console.log("Next.js dev server is probably not running:", e.message);
  }
}
run();
