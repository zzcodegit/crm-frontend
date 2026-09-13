/** Центрированный чип даты между сообщениями (как в Telegram). */
export default function ChatDaySeparator({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div className="flex justify-center my-3 select-none" role="separator" aria-label={label}>
      <div
        className="px-3 py-1.5 rounded-full text-[12px] font-semibold leading-none tracking-wide"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.28)",
          color: "#fff",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
