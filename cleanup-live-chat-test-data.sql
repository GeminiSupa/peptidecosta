-- Cleanup for live chat rows created while verifying the mobile/UI fixes,
-- plus the legacy "[object Object]" messages written before commit 36c57b9
-- (the send button used to pass the click event straight to the API).
--
-- Review each SELECT before running the matching DELETE.

-- 1. Test conversation created during verification (visitor "Ana Prueba").
SELECT id, visitor_id, visitor_name, visitor_email, last_message, created_at
FROM public.live_chat_conversations
WHERE visitor_id = 'lc_8cfab2b548bb4d5a85b8ed29cf5154a7';

-- DELETE FROM public.live_chat_conversations
-- WHERE visitor_id = 'lc_8cfab2b548bb4d5a85b8ed29cf5154a7';
-- (messages cascade via live_chat_messages.conversation_id ON DELETE CASCADE)

-- 2. Legacy unreadable messages. The UI now hides these, but removing them
--    keeps search, previews and lead notes clean.
SELECT id, conversation_id, sender_type, message, created_at
FROM public.live_chat_messages
WHERE btrim(message) IN ('[object Object]', 'undefined', 'null', 'NaN')
ORDER BY created_at DESC;

-- DELETE FROM public.live_chat_messages
-- WHERE btrim(message) IN ('[object Object]', 'undefined', 'null', 'NaN');

-- 3. Conversation previews that cached one of those strings. Re-point each one
--    at its newest surviving message.
UPDATE public.live_chat_conversations AS c
SET last_message = COALESCE((
      SELECT m.message
      FROM public.live_chat_messages AS m
      WHERE m.conversation_id = c.id
        AND btrim(m.message) NOT IN ('[object Object]', 'undefined', 'null', 'NaN')
      ORDER BY m.created_at DESC
      LIMIT 1
    ), '')
WHERE btrim(c.last_message) IN ('[object Object]', 'undefined', 'null', 'NaN');
