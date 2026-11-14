import type { ChannelAdapter, SendResult } from "./types";

// SMS/push/voice — stub interfaces, matching the plan's "swap the adapter,
// don't touch the flow engine or sendCommunication()" design. Fill these in
// when a provider is chosen; nothing else needs to change.
function unimplemented(channel: string): ChannelAdapter {
  return {
    async send(): Promise<SendResult> {
      return { status: "failed", error: `${channel} channel is not implemented yet` };
    },
  };
}

export const smsAdapter = unimplemented("sms");
export const pushAdapter = unimplemented("push");
export const voiceAdapter = unimplemented("voice");
