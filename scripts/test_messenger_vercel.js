async function run() {
  const messengerPayload = {
    object: 'page',
    entry: [
      {
        id: '1042589428946472',
        time: Date.now(),
        messaging: [
          {
            sender: { id: 'TEST_MESSENGER_VERCEL' },
            recipient: { id: '1042589428946472' },
            timestamp: Date.now(),
            message: {
              mid: 'mid.1457764197618:41d102a3e1ae206a38',
              text: 'Testing messenger webhook!'
            }
          }
        ]
      }
    ]
  };

  const res = await fetch('https://peptidecosta.vercel.app/api/messenger/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messengerPayload)
  });
  console.log(await res.text());
}
run();
