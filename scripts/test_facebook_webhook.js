async function testFacebookWebhook() {
  const url = 'http://localhost:3000/api/facebook/webhook';
  
  // 1. Test Messenger Message
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
              text: 'Hello, I am interested in your peptides.'
            }
          }
        ]
      }
    ]
  };

  // 2. Test Page Comment
  const commentPayload = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        time: Date.now(),
        changes: [
          {
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              comment_id: '123456_7890',
              post_id: '123456',
              sender_id: 'COMMENTER_123',
              sender_name: 'Test Commenter',
              message: 'How much does this cost?',
              created_time: Date.now() / 1000
            }
          }
        ]
      }
    ]
  };

  try {
    console.log('Sending Test Messenger Message...');
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messengerPayload)
    });
    console.log('Messenger response:', await res.json());

    console.log('\nSending Test Page Comment...');
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commentPayload)
    });
    console.log('Comment response:', await res.json());

  } catch (error) {
    console.error('Error testing webhook:', error.message);
    console.log('Note: Make sure your Next.js dev server is running on localhost:3000');
  }
}

testFacebookWebhook();
