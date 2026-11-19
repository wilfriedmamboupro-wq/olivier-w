import type { Message } from "../domain/rfp";

export default function MessageThread({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="panel__hint">No messages exchanged yet.</p>;
  }

  return (
    <div className="message-list">
      {messages.map((message, i) => (
        <article key={i} className="message">
          <div className="message__head">
            <span>
              {message.thread} · {message.direction === "outbound" ? "Sent" : "Received"}
            </span>
          </div>
          <p className="message__subject">{message.subject}</p>
          <p className="message__body">{message.body}</p>
        </article>
      ))}
    </div>
  );
}
