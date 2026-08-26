

Phase 2 — Auto-Synced Internal Communication Sidebar


Goal

Upgrade the existing Internal Communication feature so it works more like WhatsApp/Slack.

Currently, users must manually create a thread/conversation before they can chat.

I want to remove that requirement.

The sidebar should automatically show all users the current user is allowed to communicate with, whether or not a conversation already exists. (all va + admins also all allow for internal but not talking about patientns oky)

---

What I want

1. Auto-sync users in sidebar

When the user opens Internal Communication:

Search

Sarah Ahmed
  Last message...
  2m ago

John Doe
  Thanks
  10m ago

Michael
  No messages yet

Users with no conversation must still appear.

Do NOT create empty conversation/thread records just to show users.

Only create a conversation when the first actual message is sent.

---

2. Existing conversations

If a conversation already exists:

- Show latest message.
- Show last message time.
- Show unread count.
- Sort recent conversations appropriately.
- Clicking the user opens the existing conversation.

---

3. New chat

If no conversation exists:

User clicks:

Sarah Ahmed

Open an empty chat:

Sarah Ahmed

No messages yet.
Start a conversation...

[ Type message... ] [Send]

Do NOT create the conversation yet.

When the first message is sent:

Create conversation
        ↓
Create message
        ↓
Return/update conversation

This must be safe against duplicate conversations.

---

4. Realtime sidebar updates

Use the project's existing Socket.IO infrastructure.

When another user sends a message:
need to move that usser top in sidebar 
Incoming message
      ↓
Socket event
      ↓
Update affected sidebar item
      ↓
Update latest message
      ↓
Update unread count
      ↓
Move conversation to correct position

Do not reload the entire sidebar after every message.

Only update the affected user/conversation.

---

5. Unread count

If a message arrives for a conversation that is not currently open:

unreadCount + 1

If the conversation is currently open, don't incorrectly increase the unread count.

Opening a conversation should mark its messages as read using the existing read/unread system.

---




6. Online status

If the existing Socket.IO architecture supports presence, show:

🟢 Online
⚪ Offline

Do not introduce unnecessary infrastructure just for this.

---

7. Performance

This is important.

Avoid N+1 queries.

Do NOT do:

Get 100 users
→ query latest message 100 times
→ query unread count 100 times

Use optimized/batched database queries.

Also:

- Don't refetch the entire sidebar after every message.
- Don't reload the entire conversation unnecessarily.
- Use the existing caching/state-management approach.
- Keep the UI responsive.

---

Security

Only show users that the authenticated user is actually allowed to communicate with.

Do not trust "userId" or "conversationId" from the frontend.

Existing authentication and authorization rules must remain intact.

---

Before coding

First inspect the existing:

- Chat module
- Conversation/thread logic
- Message model
- Prisma schema
- Socket.IO implementation
- Chat frontend components
- Chat state/hooks
- Authentication/authorization

Extend the existing architecture. Do not rewrite the chat system or create duplicate services.

---

Definition of Done

I should be able to:
0.real time typeing inndecastor must be show ,
1. Open Internal Communication.
2. Immediately see all permitted users in the sidebar.
3. Click a user who has never chatted before.
4. See an empty chat without a database thread being created.
5. Send the first message.
6. Have the conversation automatically created.
7. See the message immediately.
8. Have the sidebar show the latest message.
9. Receive new messages in realtime.

10. See unread counts update realtime.
11. Have conversations reorder automatically based on activity.
12. Refresh the page and see the same correct state.
send media and files,
auto tyeping, effetc 


Final requirement

After implementation, run the project's typecheck, lint, tests, and build. Fix any errors caused by this phase.

Do not modify unrelated features.

