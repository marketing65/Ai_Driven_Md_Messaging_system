import { supabase } from '../config/db.js';

export function startScheduler(io) {
  console.log('[Scheduler] Background message scheduler started (10s interval)');

  setInterval(async () => {
    try {
      const now = new Date();
      // 1. Fetch unsent scheduled messages that are due (send_at <= NOW())
      const { data: dueMessages, error: selectErr } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('sent', false)
        .lte('send_at', now.toISOString())
        .order('send_at', { ascending: true });

      if (selectErr) throw selectErr;
      if (!dueMessages || dueMessages.length === 0) return;

      console.log(`[Scheduler] Found ${dueMessages.length} due scheduled messages to deliver.`);

      for (const msg of dueMessages) {
        // 2. Deliver the message by inserting into the messages table
        const { error: insertErr } = await supabase
          .from('messages')
          .insert({
            chat_id: msg.chat_id,
            sender: msg.sender,
            message: msg.message,
            type: 'text'
          });

        if (insertErr) throw insertErr;

        // 3. Mark scheduled message as sent
        const { error: updateErr } = await supabase
          .from('scheduled_messages')
          .update({ sent: true })
          .eq('id', msg.id);

        if (updateErr) throw updateErr;

        // 4. Determine recipient from chatId (format: 'md-<userId>')
        const userIdMatch = msg.chat_id.match(/md-([a-f0-9-]+)/i);
        if (userIdMatch && io) {
          const recipientUserId = userIdMatch[1];
          const notificationContent = msg.sender === 'md' 
            ? `replies: New scheduled message from MD: "${msg.message.substring(0, 30)}..."`
            : `asked you: New scheduled message from Employee: "${msg.message.substring(0, 30)}..."`;

          // Log in-app notification in DB using direct Supabase insert
          try {
            const { data: notifData, error: notifErr } = await supabase
              .from('notifications')
              .insert({
                user_id: recipientUserId,
                content: notificationContent,
                read_status: false
              })
              .select();

            if (notifErr) throw notifErr;
            const notification = notifData[0];

            // Emit live socket event to trigger instant frontend refresh
            io.to(recipientUserId.toString()).emit('new_notification', notification);
            
            // Also notify md-group if sent by employee
            if (msg.sender === 'employee') {
              io.to('md-group').emit('new_notification', notification);
            }
          } catch (notifErr) {
            console.error('[Scheduler] Notification saving error:', notifErr.message);
          }
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error running background message scheduler:', err.message);
    }
  }, 10000); // Poll every 10 seconds
}
