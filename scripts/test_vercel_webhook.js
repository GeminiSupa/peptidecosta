async function run() {
  const messengerPayload = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        time: Date.now(),
        messaging: [
          {
            sender: { id: 'TEST_SENDER_VERCEL' },
            recipient: { id: 'PAGE_ID' },
            timestamp: Date.now(),
            message: {
              mid: 'mid.1457764197618:41d102a3e1ae206a38',
              text: 'Hello, vercel testing!'
            }
          }
        ]
      }
    ]
  };

  const res = await fetch('https://peptidecosta.vercel.app/api/facebook/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messengerPayload)
  });
  console.log(await res.text());
}
run();
