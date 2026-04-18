import { useEffect } from "react";

export function useHeartbeat(url = "/api/heartbeat", intervalMs = 10000) {
  useEffect(() => {
    const send = () => fetch(url, { method: "POST" }).catch(() => {});
    send();
    const id = setInterval(send, intervalMs);
    return () => clearInterval(id);
  }, [url, intervalMs]);
}
